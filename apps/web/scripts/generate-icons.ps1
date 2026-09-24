& py -3 (Join-Path $PSScriptRoot 'generate-icons.py')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
