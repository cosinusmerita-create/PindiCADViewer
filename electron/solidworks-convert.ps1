# Opens a CAD file in the running SOLIDWORKS (read-only) and exports a copy the
# viewer can read: STEP AP214 for parts and assemblies (keeps the assembly
# structure), DXF for drawings. Used by electron/main.js for every format the
# viewer cannot parse itself (native SOLIDWORKS, eDrawings, Parasolid, ACIS,
# JT, Inventor, CATIA V5, NX, Creo, Solid Edge, DWG...), so what can be opened
# is exactly what this SOLIDWORKS installation can open.
#
# Safety rules (same as Pindi Macro Debugger): read-only open, only a copy is
# exported, and a document that was already open in SOLIDWORKS is never
# closed. Messages are error CODES only (ASCII): Windows PowerShell 5.1 reads
# a BOM-less script as ANSI, so French text lives in the renderer instead.
# The last stdout line is the JSON result.
param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputDir
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Finish($result) {
  Write-Output ($result | ConvertTo-Json -Compress -Depth 4)
  exit 0
}

# PowerShell's own COM adapter fails on every SOLIDWORKS call
# (TYPE_E_ELEMENTNOTFOUND: it relies on type information SOLIDWORKS does not
# expose for these objects), so every call goes through pure IDispatch late
# binding - the PowerShell counterpart of the pywin32 pitfalls noted in Pindi
# Macro Debugger. By-ref outputs (error codes) come back in the args array;
# a VBA "Nothing" object argument must be a VT_DISPATCH null (DispatchWrapper).
$Invoke = [Reflection.BindingFlags]::InvokeMethod
$Get = [Reflection.BindingFlags]::GetProperty
# PowerShell may hand values over wrapped in a PSObject (e.g. Join-Path's
# string), which COM rejects with DISP_E_TYPEMISMATCH: pass the base objects.
function Unwrap([object[]]$argList) {
  for ($i = 0; $i -lt $argList.Count; $i++) {
    if ($null -ne $argList[$i]) { $argList[$i] = $argList[$i].PSObject.BaseObject }
  }
}
function Call($obj, [string]$name, [object[]]$argList = @()) {
  Unwrap $argList
  return [System.__ComObject].InvokeMember($name, $Invoke, $null, $obj, $argList)
}
function Prop($obj, [string]$name) {
  return [System.__ComObject].InvokeMember($name, $Get, $null, $obj, $null)
}
# Calls $name with $argList, marking the positions in $refs as by-ref; the
# updated values are read back from $argList by the caller.
function CallRef($obj, [string]$name, [object[]]$argList, [int[]]$refs) {
  $modifier = New-Object Reflection.ParameterModifier($argList.Count)
  foreach ($i in $refs) { $modifier[$i] = $true }
  Unwrap $argList
  return [System.__ComObject].InvokeMember($name, $Invoke, $null, $obj, $argList, @($modifier), $null, $null)
}
function Nothing { return [Runtime.InteropServices.DispatchWrapper]::new([object]$null) }

# swDocumentTypes_e / swOpenDocOptions_e / swSaveAsOptions_e values, read from
# this machine's swconst.tlb (SOLIDWORKS 2025).
$swDocPART = 1; $swDocASSEMBLY = 2; $swDocDRAWING = 3
$swOpenSilent = 1; $swOpenReadOnly = 2
$swSaveSilent = 1; $swSaveCopy = 2

if (-not (Test-Path -LiteralPath $InputPath)) { Finish @{ ok = $false; code = 'INPUT_NOT_FOUND' } }

try {
  $sw = [Runtime.InteropServices.Marshal]::GetActiveObject('SldWorks.Application')
} catch {
  Finish @{ ok = $false; code = 'SOLIDWORKS_NOT_RUNNING' }
}

$ext = [IO.Path]::GetExtension($InputPath).ToLowerInvariant()
$native = @{ '.sldprt' = $swDocPART; '.prtdot' = $swDocPART; '.sldasm' = $swDocASSEMBLY; '.asmdot' = $swDocASSEMBLY;
             '.slddrw' = $swDocDRAWING; '.drwdot' = $swDocDRAWING }

$log = New-Object System.Collections.ArrayList
$model = $null
$alreadyOpen = $false

try {
  # A document the user already has open is reused and left open afterwards.
  $model = Call $sw 'GetOpenDocumentByName' @($InputPath)
  if ($model) { $alreadyOpen = $true; [void]$log.Add('ALREADY_OPEN') }

  if (-not $model) {
    if ($native.ContainsKey($ext)) {
      $a = [object[]]@($InputPath, $native[$ext], ($swOpenSilent -bor $swOpenReadOnly), '', 0, 0)
      $model = CallRef $sw 'OpenDoc6' $a @(4, 5)
      [void]$log.Add("OPEN err=$($a[4]) warn=$($a[5])")
    } else {
      # Neutral and third-party formats: imported into a new, unsaved document.
      $a = [object[]]@($InputPath, 'r', (Nothing), 0)
      $model = CallRef $sw 'LoadFile4' $a @(3)
      [void]$log.Add("IMPORT err=$($a[3])")
    }
  }
  if (-not $model) { throw 'CODE:OPEN_FAILED' }

  $type = Call $model 'GetType'
  if ($type -eq $swDocASSEMBLY) {
    # Lightweight components carry no geometry for export: resolve them.
    try { [void](Call $model 'ResolveAllLightWeightComponents' @($false)) } catch { [void]$log.Add('RESOLVE_SKIPPED') }
  }

  $base = [IO.Path]::GetFileNameWithoutExtension($InputPath)
  $kind = if ($type -eq $swDocDRAWING) { 'dxf' } else { 'step' }
  $out = Join-Path $OutputDir ($base + '.' + $kind)
  if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Force }

  # ModelDoc2.SaveAs3(name, version, options) returns the error code directly:
  # IModelDocExtension.SaveAs3's two optional object arguments do not survive
  # this late-bound route (DISP_E_TYPEMISMATCH even with a VT_DISPATCH null).
  $err = Call $model 'SaveAs3' @($out, 0, ($swSaveSilent -bor $swSaveCopy))
  [void]$log.Add("EXPORT $kind err=$err")
  if ($err -ne 0 -or -not (Test-Path -LiteralPath $out)) {
    throw 'CODE:EXPORT_FAILED'
  }
  # SOLIDWORKS can report success (code 0) for a file without any geometry:
  # observed for every STEP export once an import had stalled in the same
  # session (a restart of SOLIDWORKS fixes it). Check the content itself.
  $text = [IO.File]::ReadAllText($out, [Text.Encoding]::GetEncoding(28591))
  if ($kind -eq 'step') {
    $hasGeometry = $text -match 'MANIFOLD_SOLID_BREP|SHELL_BASED_SURFACE_MODEL|ADVANCED_FACE|FACETED_BREP|TRIANGULATED_FACE_SET'
  } else {
    $hasGeometry = $text -match '(?m)^\s*(LINE|LWPOLYLINE|POLYLINE|CIRCLE|ARC|SPLINE|ELLIPSE|INSERT|3DFACE)\s*$'
  }
  if (-not $hasGeometry) { throw 'CODE:EMPTY_EXPORT' }
  $result = @{ ok = $true; output = $out; kind = $kind; docType = $type; log = $log }
} catch {
  # Codes thrown above ('CODE:...') or any COM exception - never exit from inside
  # the try block, so the finally below always closes what this script opened.
  $msg = $_.Exception.Message
  if ($msg -like 'CODE:*') { $result = @{ ok = $false; code = $msg.Substring(5); log = $log } }
  else { $result = @{ ok = $false; code = 'EXCEPTION'; message = $msg; log = $log } }
} finally {
  if ($model -and -not $alreadyOpen) {
    try { [void](Call $sw 'CloseDoc' @((Call $model 'GetTitle'))) } catch { }
  }
}
Finish $result
