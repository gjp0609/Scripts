import dayjs from 'dayjs';

const me = true;
let startDay = dayjs('2026-01-01');
let endDay = dayjs('2027-01-01');
while (startDay.isBefore(endDay)) {
    if (startDay.get('date') === 1) {
        console.log(startDay.format('- ## ' + startDay.format('YYYY-MM')));
        console.log(startDay.format('  - ### 工作计划'));
        console.log(startDay.format(`    1. 按时完成xx (${startDay.format('YYYY/M/D')} - ${startDay.add(1, 'month').add(-1, 'day').format('YYYY/M/D')}) 预估 1 天`));
        console.log(startDay.format(`    2. 按时完成xx (${startDay.format('YYYY/M/D')} - ${startDay.add(1, 'month').add(-1, 'day').format('YYYY/M/D')}) 预估 1 天`));
        console.log(startDay.format(`    3. 按时完成xx (${startDay.format('YYYY/M/D')} - ${startDay.add(1, 'month').add(-1, 'day').format('YYYY/M/D')}) 预估 1 天`));
        console.log(startDay.format(`    4. 按时完成xx (${startDay.format('YYYY/M/D')} - ${startDay.add(1, 'month').add(-1, 'day').format('YYYY/M/D')}) 预估 1 天`));
        if (me) console.log(startDay.format('    5. 按时完成直属领导安排的临时工作任务'));
        if (me) console.log(startDay.format('    6. 积极配合测试组工作, 完成测试组提交的 BUG 修复'));
        if (me) console.log(startDay.format('    7. 日常程序部署、运维等需求'));
        if (me) console.log(startDay.format('    8. 服从工作安排, 工作态度端正'));
        if (me) console.log(startDay.format('    9. 按时完成每月 8 小时学习'));
        console.log(startDay.format('  - ### 完成情况'));
        console.log(startDay.format(`    1. xx（${startDay.format('YYYY/M/D')} - ${startDay.add(1, 'month').add(-1, 'day').format('YYYY/M/D')})`));
        console.log(startDay.format(`    2. xx（${startDay.format('YYYY/M/D')} - ${startDay.add(1, 'month').add(-1, 'day').format('YYYY/M/D')})`));
        console.log(startDay.format(`    3. xx（${startDay.format('YYYY/M/D')} - ${startDay.add(1, 'month').add(-1, 'day').format('YYYY/M/D')})`));
        console.log(startDay.format(`    4. xx（${startDay.format('YYYY/M/D')} - ${startDay.add(1, 'month').add(-1, 'day').format('YYYY/M/D')})`));
        if (me) console.log(startDay.format('    5. 按时完成直属领导安排的临时工作任务'));
        if (me) console.log(startDay.format('    6. 积极配合测试组工作, 完成测试组提交的 BUG 修复'));
        if (me) console.log(startDay.format('    7. 日常程序部署、运维等需求'));
        if (me) console.log(startDay.format('    8. 服从工作安排, 工作态度端正'));
        if (me) console.log(startDay.format('    9. 按时完成每月 8 小时学习'));
    }
    if (startDay.get('days') === 1) {
        console.log(startDay.format('  - ### _**week**_'));
    }
    console.log(startDay.format('  - ### YYYY-MM-DD'));
    startDay = startDay.add(1, 'day');
}
