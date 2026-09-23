$launcher = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "launch-founder-os.ps1"
$desktop  = [System.Environment]::GetFolderPath("Desktop")
$lnkPath  = Join-Path $desktop "Founder OS.lnk"

$wsh = New-Object -ComObject WScript.Shell
$lnk = $wsh.CreateShortcut($lnkPath)
$lnk.TargetPath       = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$lnk.Arguments        = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
$lnk.WorkingDirectory = Split-Path -Parent $launcher
$lnk.IconLocation     = "shell32.dll,13"
$lnk.Description      = "Lancer Founder OS en local"
$lnk.Save()

Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show(
    "Raccourci 'Founder OS' créé sur le Bureau.`n`nDouble-cliquez dessus pour lancer l'application.",
    "Installation réussie",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
)
