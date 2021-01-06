#Include, Libs.ahk

SwitchIMEToEN()
generateCertificates()

generateCertificates(){
    opensslPath = C:/Program Files/Git/usr/bin/openssl.exe
    certPath = C:/Files/Temp/
    password = 111111

    Run powershell
    Sleep, 500
    Send &'%opensslPath%' genrsa -des3 -out %certPath%server.key 2048{enter}
    Send %password%{enter}
    Send %password%{enter}
    Sleep, 300

    Send &'%opensslPath%' req -new -x509 -key %certPath%server.key -out %certPath%server.crt -days 3650{enter}
    Send %password%{enter}
    Send CN{enter} ; Country Name
    Send Beijing{enter} ; State or Province Name
    Send haidian{enter} ; Locality Name
    Send org{enter} ; Organization Name
    Send dev{enter} ; Organizational Unit Name
    Send test{enter} ; Common Name
    Send {enter} ; Email Address
    Sleep, 300

    Send &'%opensslPath%' pkcs12 -export -out %certPath%server.pfx -inkey %certPath%server.key -in %certPath%server.crt{enter}
    Send %password%{enter}
    Send %password%{enter}
    Send %password%{enter}
}
