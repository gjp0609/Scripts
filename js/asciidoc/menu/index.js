window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.sectlevel1>li>a').forEach((item) => {
        let listElement = item.parentElement.querySelector('ul');
        let div = document.createElement('div');
        let span = document.createElement('span');
        span.innerText = listElement ? '<' : '';
        div.classList.add('expand');
        div.appendChild(span);
        if (listElement) {
            listElement.classList.add('hide');
            span.style.transform = 'rotate(0deg)';
            div.addEventListener('click', (e) => {
                let ul = div.parentElement.querySelector('ul');
                if (ul) {
                    if (ul.matches('.hide')) {
                        ul.classList.remove('hide');
                        span.style.transform = 'rotate(-90deg)';
                    } else {
                        ul.classList.add('hide');
                        span.style.transform = 'rotate(0deg)';
                    }
                }
            });
        }
        item.insertAdjacentElement('afterend', div);
    });
});
