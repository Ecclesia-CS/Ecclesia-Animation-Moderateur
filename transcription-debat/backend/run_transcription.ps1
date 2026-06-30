<#
.SYNOPSIS
  Pipeline de transcription offline Ecclesia, de bout en bout :
  anonymisation du log  ->  transcription Whisper + alignement  ->  correction Gemini.

.DESCRIPTION
  Enchaîne anonymize_log.py puis transcribe_offline.py (qui appelle correct_transcript.py).
  À lancer depuis n'importe où : le script se cale sur son propre dossier (backend/).

.EXAMPLE
  .\run_transcription.ps1 -Csv "Débats\Multiculturalisme\71B505\ecclesia_table_71B505_2026-06-17.csv" `
                          -Audio "Débats\Multiculturalisme\71B505\Thursday at 01_53_41 PM.mp3" `
                          -Code 71B505 -Topic "Multiculturalisme" `
                          -Participants "Emilien,Lysandre,Chahima,Sarah,Maxence,Loulou,Jules,Mimi,Ilyès" `
                          -RedactNames "Antoine,Justine,Faustin" -EditNameMap

.EXAMPLE
  # Avec diarisation acoustique (nécessite HF_TOKEN) :
  .\run_transcription.ps1 -Csv ... -Audio ... -Code 71B505 -Topic "Multiculturalisme" -Diarize
#>
param(
    [Parameter(Mandatory = $true)][string]$Csv,            # export Ecclesia (.csv)
    [Parameter(Mandatory = $true)][string]$Audio,          # enregistrement (.mp3/.wav/...)
    [Parameter(Mandatory = $true)][string]$Code,           # code de la table, ex. 71B505
    [Parameter(Mandatory = $true)][string]$Topic,          # thème, ex. "Multiculturalisme"
    [string]$Participants = "",                            # prénoms entendus (aide Whisper), séparés par virgule
    [string[]]$Refuse = @(),                               # participants ayant refusé l'enregistrement
    [string]$RedactNames = "",                             # prénoms à masquer en plus de name_map.json
    [string]$AudioStart = "",                              # offset ISO si l'auto-détection échoue
    [string]$GeminiModel = "",                             # override du modèle (défaut : gemini-3.1-flash-lite)
    [switch]$Diarize,                                      # diarisation pyannote (HF_TOKEN requis)
    [switch]$EditNameMap,                                  # pause après anonymisation pour éditer name_map.json
    [switch]$SkipAnonymize,                                # réutiliser un log_anon.csv existant
    [switch]$DryRun                                        # afficher les commandes sans exécuter
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"
if ($GeminiModel) { $env:GEMINI_MODEL = $GeminiModel }

# Se caler sur backend/ (dossier du script) pour résoudre .venv et les .py
$Backend = $PSScriptRoot
$Python  = Join-Path $Backend ".venv\Scripts\python.exe"

function Resolve-InputPath([string]$p) {
    if ([System.IO.Path]::IsPathRooted($p)) { return $p }
    return (Join-Path (Get-Location) $p)
}

$CsvPath   = Resolve-InputPath $Csv
$AudioPath = Resolve-InputPath $Audio
$LogAnon   = Join-Path (Split-Path $CsvPath -Parent) "log_anon.csv"
$NameMap   = Join-Path (Split-Path $CsvPath -Parent) "name_map.json"

function Invoke-Step([string]$Title, [string[]]$PyArgs) {
    Write-Host ""
    Write-Host "=== $Title ===" -ForegroundColor Cyan
    Write-Host "$Python $($PyArgs -join ' ')" -ForegroundColor DarkGray
    if ($DryRun) { return }
    & $Python @PyArgs
    if ($LASTEXITCODE -ne 0) { throw "Échec : $Title (exit $LASTEXITCODE)" }
}

# --- Vérifications ---
if (-not (Test-Path $Python))    { throw "Venv introuvable : $Python (lance depuis un clone à jour avec .venv créé)" }
if (-not (Test-Path $CsvPath))   { throw "CSV introuvable : $CsvPath" }
if (-not (Test-Path $AudioPath)) { throw "Audio introuvable : $AudioPath" }

Push-Location $Backend
try {
    # --- Étape 1 : anonymisation ---
    if (-not $SkipAnonymize) {
        $anonArgs = @("code python\anonymize_log.py", $CsvPath, "--output", $LogAnon)
        foreach ($r in $Refuse) { $anonArgs += @("--refuse", $r) }
        Invoke-Step "Étape 1/2 — Anonymisation du log" $anonArgs
    } else {
        Write-Host "Étape 1 ignorée (-SkipAnonymize) — réutilise $LogAnon" -ForegroundColor Yellow
    }

    # --- Pause optionnelle pour enrichir name_map.json ---
    if ($EditNameMap -and -not $DryRun) {
        Write-Host ""
        Write-Host "name_map.json généré : $NameMap" -ForegroundColor Green
        Write-Host "Ajoute les variantes orales (Sarah/SASA...) et les noms de famille, puis sauvegarde." -ForegroundColor Green
        if (Test-Path $NameMap) { Start-Process notepad.exe $NameMap }
        Read-Host "Appuie sur Entrée quand name_map.json est prêt pour continuer"
    }

    # --- Étape 2 : transcription + correction Gemini ---
    $txArgs = @("code python\transcribe_offline.py", $AudioPath, $LogAnon, "--group", $Code, "--topic", $Topic)
    if ($Participants) { $txArgs += @("--participants", $Participants) }
    if ($RedactNames)  { $txArgs += @("--redact-names", $RedactNames) }
    if ($AudioStart)   { $txArgs += @("--audio-start", $AudioStart) }
    if ($Diarize)      { $txArgs += "--diarize" }
    Invoke-Step "Étape 2/2 — Transcription Whisper + correction Gemini" $txArgs

    if (-not $DryRun) {
        Write-Host ""
        Write-Host "✅ Terminé. Fichiers dans : transcripts\$Topic\$Code\" -ForegroundColor Green
        Write-Host "   $($Code)_<date>_corrected.txt / .json  ← à utiliser" -ForegroundColor Green
    }
}
finally {
    Pop-Location
}
