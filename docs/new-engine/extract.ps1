Oparam($Path)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [System.IO.File]::OpenRead($Path)
$archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Read)
$entry = $archive.GetEntry('word/document.xml')
$entryStream = $entry.Open()
$reader = New-Object System.IO.StreamReader($entryStream)
$xml = $reader.ReadToEnd()
$reader.Close()
$entryStream.Close()
$archive.Dispose()
$stream.Close()

# Extract paragraphs properly
$xml -replace "</w:p>", "`n" -replace "<[^>]+>", "" | Out-File -FilePath "$Path.txt" -Encoding utf8
Write-Output "Extracted $Path to $Path.txt"
