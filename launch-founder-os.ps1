Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$PROJECT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PORT        = 8080
$URL         = "http://localhost:$PORT"

# ── Fenêtre de chargement ──────────────────────────────────────
$form = New-Object System.Windows.Forms.Form
$form.Text            = "Founder OS"
$form.ClientSize      = New-Object System.Drawing.Size(340, 100)
$form.StartPosition   = "CenterScreen"
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox     = $false
$form.MinimizeBox     = $false
$form.TopMost         = $true
$form.BackColor       = [System.Drawing.Color]::FromArgb(18, 18, 18)

$logo = New-Object System.Windows.Forms.Label
$logo.Text      = "FOUNDER OS"
$logo.ForeColor = [System.Drawing.Color]::White
$logo.Font      = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$logo.Location  = New-Object System.Drawing.Point(20, 13)
$logo.Size      = New-Object System.Drawing.Size(300, 22)
$form.Controls.Add($logo)

$lbl = New-Object System.Windows.Forms.Label
$lbl.Text      = "Démarrage…"
$lbl.ForeColor = [System.Drawing.Color]::FromArgb(150, 150, 150)
$lbl.Font      = New-Object System.Drawing.Font("Segoe UI", 8)
$lbl.Location  = New-Object System.Drawing.Point(20, 36)
$lbl.Size      = New-Object System.Drawing.Size(300, 18)
$form.Controls.Add($lbl)

$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Location              = New-Object System.Drawing.Point(20, 63)
$bar.Size                  = New-Object System.Drawing.Size(300, 8)
$bar.Style                 = "Marquee"
$bar.MarqueeAnimationSpeed = 20
$form.Controls.Add($bar)

$form.Show()
[System.Windows.Forms.Application]::DoEvents()

function Update($msg) {
    $lbl.Text = $msg
    [System.Windows.Forms.Application]::DoEvents()
}

function Test-Port {
    try {
        $t = New-Object System.Net.Sockets.TcpClient
        $t.Connect("127.0.0.1", $PORT)
        $t.Close()
        return $true
    } catch { return $false }
}

# ── Vérification / démarrage serveur ──────────────────────────
Update "Vérification du serveur local…"
Start-Sleep -Milliseconds 200

if (Test-Port) {
    Update "Serveur déjà actif — ouverture…"
    Start-Sleep -Milliseconds 400
} else {
    Update "Démarrage du serveur Python…"
    $serverScript = Join-Path $PROJECT_DIR "server.py"
    Start-Process python `
        -ArgumentList $serverScript `
        -WorkingDirectory $PROJECT_DIR `
        -WindowStyle Hidden

    Update "Attente du serveur…"
    $n = 0
    while (-not (Test-Port) -and $n -lt 40) {
        Start-Sleep -Milliseconds 400
        $n++
        [System.Windows.Forms.Application]::DoEvents()
    }

    if (-not (Test-Port)) {
        Update "Impossible de démarrer le serveur."
        Start-Sleep -Milliseconds 2000
        $form.Close()
        exit
    }
}

# ── Ouverture Chrome ──────────────────────────────────────────
Update "Ouverture dans Chrome…"
Start-Sleep -Milliseconds 300

$chromePaths = @(
    "$env:PROGRAMFILES\Google\Chrome\Application\chrome.exe",
    "${env:PROGRAMFILES(X86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($chrome) { Start-Process $chrome $URL }
else         { Start-Process $URL }

$form.Close()
