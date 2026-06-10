//javascript:(()=>{function e(e){let r={red:0,green:255,blue:0},l={red:0,green:0,blue:255};var n={red:255,green:0,blue:0},o=r;l&&(e*=2)>=1&&(e-=1,n=r,o=l);let d={red:Math.floor(n.red+(o.red-n.red)*e),green:Math.floor(n.green+(o.green-n.green)*e),blue:Math.floor(n.blue+(o.blue-n.blue)*e)};return"rgb("+d.red+","+d.green+","+d.blue+")"}let r=(e,l=0)=>null===e.parentNode?l:r(e.parentNode,l+1),l=n=>{if(n){let o=Math.max(...[...n.body.querySelectorAll("*")].reduce((e,l)=>(e.add(r(l)),e),new Set));n.body.querySelectorAll("*").forEach(n=>"IFRAME"===n.nodeName?l(n.contentDocument):n.style.outline=n.style.outline?"":`1px solid ${e(r(n)/o)}`)}};l(document)})();
// noinspection UnnecessaryLabelJS
javascript: (() => {
    function colorGradient(fade) {
       let  rgbColor1={ red: 255, green: 0, blue: 0 }
       let  rgbColor2={ red: 0, green: 255, blue: 0 }
       let  rgbColor3={ red: 0, green: 0, blue: 255}
        var color1 = rgbColor1;
        var color2 = rgbColor2;

        // Do we have 3 colors for the gradient? Need to adjust the params.
        if (rgbColor3) {
            fade = fade * 2;

            // Find which interval to use and adjust the fade percentage
            if (fade >= 1) {
                fade -= 1;
                color1 = rgbColor2;
                color2 = rgbColor3;
            }
        }


        let gradient = {
            red: Math.floor(color1.red + (color2.red - color1.red) * fade),
            green: Math.floor(color1.green + (color2.green - color1.green) * fade),
            blue: Math.floor(color1.blue + (color2.blue - color1.blue) * fade)
        };
        return 'rgb(' + gradient.red + ',' + gradient.green + ',' + gradient.blue + ')';
    }

    let calcLevel = (node, level = 0) => (node.parentNode === null ? level : calcLevel(node.parentNode, level + 1));

    let outline = (doc) => {
        if (doc) {
            let max = Math.max(
                ...[...doc.body.querySelectorAll('*')].reduce((prev, curr) => {
                    prev.add(calcLevel(curr));
                    return prev;
                }, new Set())
            );
            doc.body
                .querySelectorAll('*')
                .forEach((item) =>
                    item.nodeName === 'IFRAME'
                        ? outline(item.contentDocument)
                        : (item.style.outline = item.style.outline ? '' : `1px solid ${colorGradient(calcLevel(item) / max)}`)
                );
        }
    };
    outline(document);
})();
