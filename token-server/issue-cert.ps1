param(
  [Parameter(Mandatory = $true)][string]$Pfx,
  [Parameter(Mandatory = $true)][string]$Cer,
  [Parameter(Mandatory = $true)][string]$Pass,
  [Parameter(Mandatory = $true)][string]$Dns
)

$names = @($Dns.Split(',') | Where-Object { $_ })
$san = foreach ($name in $names) {
  if ($name -match '^\d{1,3}(\.\d{1,3}){3}$') { "IPAddress=$name" } else { "DNS=$name" }
}
$sanText = '2.5.29.17={text}' + ($san -join '&')

$ErrorActionPreference = 'Stop'
Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq 'CN=Pocket token' } | Remove-Item
Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Subject -eq 'CN=Pocket token' } | Remove-Item
$cert = New-SelfSignedCertificate -Subject 'CN=Pocket token' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 2048 -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(2) -TextExtension @($sanText, '2.5.29.19={text}CA=true', '2.5.29.37={text}1.3.6.1.5.5.7.3.1')
$secure = ConvertTo-SecureString $Pass -AsPlainText -Force
Export-PfxCertificate -Cert $cert -FilePath $Pfx -Password $secure | Out-Null
Export-Certificate -Cert $cert -FilePath $Cer | Out-Null
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'CurrentUser')
$store.Open('ReadWrite')
$store.Add($cert)
$store.Close()
