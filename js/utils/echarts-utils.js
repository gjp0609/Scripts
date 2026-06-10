function isNotEmpty(obj) {
    return obj ? true : obj === '' || obj === 0;
}

class DynamicLabelShowNum {
    constructor(chart) {
        this.chart = chart;
    }

    chart;
    gridPadding = 0.06 * 2;
    fontSize = 12;
    showNum = 0;
    total = 0;
    current = 0;

    fixLabelNum() {
        this.showNum = (this.chart.getDom().clientWidth * (1 - this.gridPadding)) / this.fontSize;
        const interval = this.current / this.showNum;
        this.chart.setOption({
            xAxis: {
                axisLabel: {
                    interval: interval < 1 ? 0 : Math.round(interval)
                }
            }
        });
    }

    init(length) {
        this.total = length;
        this.current = length;
        this.fixLabelNum();
        this.chart.off('dataZoom');
        this.chart.on('dataZoom', (params) => {
            let param = params.batch ? params.batch[0] ?? params : params;
            if (isNotEmpty(param.startValue)) {
                this.current = param.endValue - param.startValue;
            } else if (isNotEmpty(param.start)) {
                this.current = (this.total * (param.end - param.start)) / 100;
            } else {
                this.current = this.total;
            }
            this.fixLabelNum();
        });
        this.chart.off('restore');
        this.chart.on('restore', (params) => {
            this.current = this.total;
            this.fixLabelNum();
        });
    }
}

function connectCharts(chart1, chart2, coefficient) {
    chart1.on('dataZoom', (params) => {
        connectDataZoom(chart2, params, coefficient);
    });
    chart2.on('dataZoom', (params) => {
        connectDataZoom(chart1, params, 1 / coefficient);
    });
    chart1.on('restore', (params) => {
        connectRestore(chart2, params);
    });
    chart2.on('restore', (params) => {
        connectRestore(chart1, params);
    });
    function connectDataZoom(targetChart, params, coefficient) {
        console.log(params);
        if (params.from !== 'connectDataZoom') {
            let param = params.batch ? params.batch[0] ?? params : params;
            if (isNotEmpty(param.startValue) || isNotEmpty(param.start)) {
                targetChart.dispatchAction({
                    type: 'dataZoom',
                    from: 'connectDataZoom',
                    startValue: isNotEmpty(param.startValue) ? Math.floor(param.startValue * coefficient) : undefined,
                    endValue: isNotEmpty(param.endValue) ? Math.floor(param.endValue * coefficient) : undefined,
                    start: param.start,
                    end: param.end
                });
            } else {
                targetChart.dispatchAction({
                    type: 'dataZoom',
                    from: 'connectDataZoom',
                    start: 0,
                    end: 100
                });
            }
        }
    }
    function connectRestore(targetChart, params) {
        console.log(params);
        if (params.from !== 'connectRestore') {
            targetChart.dispatchAction({
                type: 'restore',
                from: 'connectRestore'
            });
        }
    }
}
