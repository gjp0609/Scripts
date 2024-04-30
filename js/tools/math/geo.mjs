

function loopCheck(count, interval, check, fn) {
    let checkTask = setInterval(() => {
        if (count-- <= 0) {
            clearInterval(checkTask);
            return;
        }
        let result = check();
        if (result !== undefined && result !== null) {
            console.log('result:', result);
            clearInterval(checkTask);
            if (fn) {
                fn(result);
            }
        }
    }, interval);
}



function get(longitude, latitude) {
    function getDis(lo1, la1, lo2, la2) {
        return Math.round(
            6378.138 * 2 * Math.asin(
                Math.sqrt(
                    Math.pow(Math.sin((la2 * Math.PI / 180 - la1 * Math.PI / 180) / 2), 2)
                    + Math.cos(la2 * Math.PI / 180)
                    * Math.cos(la1 * Math.PI / 180)
                    * Math.pow(Math.sin((lo2 * Math.PI / 180 - lo1 * Math.PI / 180) / 2), 2)
                )) * 1000)
    }
    let loStart = 730_000;
    let laStart = 180_000;
    let precision = 814;

    let lo = Math.ceil(longitude * 10_000)
    let la = Math.ceil(latitude * 10_000)
    let loStep =Math.floor ((lo - loStart) / precision)
    let laStep = Math.floor((la - laStart) / precision)
    let doubles = []
    let min = Number.MAX_VALUE;
    {
        let v1 = (loStart + loStep * precision) / 10000
        let v2 = (laStart + laStep * precision) / 10000
        let x = getDis(longitude, latitude, v1, v2)
        min = Math.min(min, x);
        doubles = [v1, v2];
    }
    {
        let v1 = (loStart + (loStep + 1) * precision) / 10000
        let v2 = (laStart + laStep * precision) / 10000
        let x = getDis(longitude, latitude, v1, v2)
        min = Math.min(min, x);
        if (min === x) {
            doubles = [v1, v2];
        }
    }
    {
        let v1 = (loStart + loStep * precision) / 10000
        let v2 = (laStart + (laStep + 1) * precision) / 10000
        let x = getDis(longitude, latitude, v1, v2)
        min = Math.min(min, x);
        if (min === x) {
            doubles = [v1, v2];
        }
    }
    {
        let v1 = (loStart + (loStep + 1) * precision) / 10000
        let v2 = (laStart + (laStep + 1) * precision) / 10000
        let x = getDis(longitude, latitude, v1, v2)
        min = Math.min(min, x);
        if (min === x) {
            doubles = [v1, v2];
        }
    }
    return doubles
}
