// ==UserScript==
// @name         * V2EX
// @namespace    https://github.com/gjp0609/Scripts/
// @version      1.0
// @description  V2EX
// @author       onysakura
// @require      https://cdn.staticfile.org/jquery/3.6.0/jquery.min.js
// @include      *v2ex.com/t/*
// @icon         https://www.google.com/s2/favicons?domain=v2ex.com
// @grant        none
// ==/UserScript==

(function () {
    let cells = $('#Wrapper').find('.content').find('#Main').find('.box').find('.cell')
    cells.find('.reply_content').find('a').each((key, pointer) => {
        if (pointer.href && pointer.href.indexOf('/member/') >= 0) {
            $(pointer).attr('data', 'https://v2ex.com' + pointer.href.substr(pointer.href.indexOf('/member/')))
            pointer.href = 'javascript:void(0);'
            pointer.addEventListener('click', ev => {
                let currentOffset
                $(pointer).parents('.cell').each((key, cell) => currentOffset = cell.offsetTop)
                cells.find('strong').find('a').each((key, member) => {
                    $(member).parents('.cell').each((key, parent) => {
                        if (member.innerText === pointer.innerText) {
                            $(parent).css('background-color', '#ffefdf')
                            if (parent.offsetTop < currentOffset) {
                                parent.scrollIntoView()
                            }
                        } else {
                            $(parent).css('background-color', '')
                        }
                    })
                })
                $(pointer).parents('.cell').each((key, cell) => $(cell).css('background-color', '#dfefff'))
            })
        }
    })
})();
