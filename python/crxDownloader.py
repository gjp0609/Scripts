#!/usr/bin/env python3
import os
import urllib
from urllib.parse import urlencode
from urllib.request import urlopen


def downloadCrx(ext_id):
    """
    下载 Chrome 扩展商店的插件
    """
    print(f'start, ext_id: {ext_id}')
    crx_params = urllib.parse.urlencode({
        'response': 'redirect',
        'prodversion': '91.0',
        'acceptformat': 'crx2,crx3',
        'x': 'id=' + ext_id + '&uc'
    })
    crx_url = 'https://clients2.google.com/service/update2/crx?' + crx_params
    crx_path = ext_id + '.crx'
    print(f'downloading: {crx_url}')
    with open(crx_path, 'wb') as file:
        file.write(urlopen(crx_url).read())
    print('success')


if __name__ == '__main__':
    downloadCrx('cjpalhdlnbpafiamejdnhcphjbkeiagm')


