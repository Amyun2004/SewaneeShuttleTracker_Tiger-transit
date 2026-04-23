// =========================================
// SEWANEE TRANSIT — Schedule Page Logic
// static/js/schedule.js
// =========================================

const STOPS = [
    "TWC – Parking","Gorgas / Quintard","Classics House-ish",
    "Hodgson Hill","Biehl Commons","Fowler","French House",
    "Woodlands","Crafting Guild / Fine Arts","Tennis Courts",
    "Zone C Parking Lot","Trexant","Humphreys","The BC",
    "Wellness Commons","Village – near Regions Bank"
];

const DAILY = [
    ["7:18 am","7:20 am","7:21 am","7:23 am","7:25 am","7:26 am","7:29 am","7:30 am","7:31 am","7:33 am","7:35 am","7:36 am","7:38 am","7:40 am","7:42 am","7:44 am"],
    ["7:48 am","7:50 am","7:51 am","7:53 am","7:55 am","7:56 am","7:59 am","8:00 am","8:01 am","8:03 am","8:05 am","8:06 am","8:08 am","8:10 am","8:12 am","8:14 am"],
    ["8:18 am","8:20 am","8:21 am","8:23 am","8:25 am","8:26 am","8:29 am","8:30 am","8:31 am","8:33 am","8:35 am","8:36 am","8:38 am","8:40 am","8:42 am","8:44 am"],
    ["8:48 am","8:50 am","8:51 am","8:53 am","8:55 am","8:56 am","8:59 am","9:00 am","9:01 am","9:03 am","9:05 am","9:06 am","9:08 am","9:10 am","9:12 am","9:14 am"],
    ["9:18 am","9:20 am","9:21 am","9:23 am","9:25 am","9:26 am","9:29 am","9:30 am","9:31 am","9:33 am","9:35 am","9:36 am","9:38 am","9:40 am","9:42 am","9:44 am"],
    ["9:48 am","9:50 am","9:51 am","9:53 am","9:55 am","9:56 am","9:59 am","10:00 am","10:01 am","10:03 am","10:05 am","10:06 am","10:08 am","10:10 am","10:12 am","10:14 am"],
    "rest",
    ["11:18 am","11:20 am","11:21 am","11:23 am","11:25 am","11:26 am","11:29 am","11:30 am","11:31 am","11:33 am","11:35 am","11:36 am","11:38 am","11:40 am","11:42 am","11:44 am"],
    ["11:48 am","11:50 am","11:51 am","11:53 am","11:55 am","11:56 am","11:59 am","12:00 pm","12:01 pm","12:03 pm","12:05 pm","12:06 pm","12:08 pm","12:10 pm","12:12 pm","12:14 pm"],
    "rest",
    ["1:18 pm","1:20 pm","1:21 pm","1:23 pm","1:25 pm","1:26 pm","1:29 pm","1:30 pm","1:31 pm","1:33 pm","1:35 pm","1:36 pm","1:38 pm","1:40 pm","1:42 pm","1:44 pm"],
    ["1:48 pm","1:50 pm","1:51 pm","1:53 pm","1:55 pm","1:56 pm","1:59 pm","2:00 pm","2:01 pm","2:03 pm","2:05 pm","2:06 pm","2:08 pm","2:10 pm","2:12 pm","2:14 pm"],
    "rest",
    ["3:18 pm","3:20 pm","3:21 pm","3:23 pm","3:25 pm","3:26 pm","3:29 pm","3:30 pm","3:31 pm","3:33 pm","3:35 pm","3:36 pm","3:38 pm","3:40 pm","3:42 pm","3:44 pm"],
    ["3:48 pm","3:50 pm","3:51 pm","3:53 pm","3:55 pm","3:56 pm","3:59 pm","4:00 pm","4:01 pm","4:03 pm","4:05 pm","4:06 pm","4:08 pm","4:10 pm","4:12 pm","4:14 pm"],
    ["4:18 pm","4:20 pm","4:21 pm","4:23 pm","4:25 pm","4:26 pm","4:29 pm","4:30 pm","4:31 pm","4:33 pm","4:35 pm","4:36 pm","4:38 pm","4:40 pm","4:42 pm","4:44 pm"],
    "rest",
    ["6:48 pm","6:50 pm","6:51 pm","6:53 pm","6:55 pm","6:56 pm","6:59 pm","7:00 pm","7:01 pm","7:03 pm","7:05 pm","7:06 pm","7:08 pm","7:10 pm","7:12 pm","7:14 pm"],
    ["7:18 pm","7:20 pm","7:21 pm","7:23 pm","7:25 pm","7:26 pm","7:29 pm","7:30 pm","7:31 pm","7:33 pm","7:35 pm","7:36 pm","7:38 pm","7:40 pm","7:42 pm","7:44 pm"],
    ["7:48 pm","7:50 pm","7:51 pm","7:53 pm","7:55 pm","7:56 pm","7:59 pm","8:00 pm","8:01 pm","8:03 pm","8:05 pm","8:06 pm","8:08 pm","8:10 pm","8:12 pm","8:14 pm"],
    "rest",
];

const NIGHT = [
    ["9:08 pm","9:11 pm","9:12 pm","9:13 pm","9:15 pm","9:17 pm","9:19 pm","9:20 pm","9:21 pm","9:23 pm","9:25 pm","9:27 pm","9:28 pm","9:30 pm","9:32 pm","9:34 pm"],
    ["9:38 pm","9:41 pm","9:42 pm","9:43 pm","9:45 pm","9:47 pm","9:49 pm","9:50 pm","9:51 pm","9:53 pm","9:55 pm","9:57 pm","9:58 pm","10:00 pm","10:02 pm","10:04 pm"],
    ["10:08 pm","10:11 pm","10:12 pm","10:13 pm","10:15 pm","10:17 pm","10:19 pm","10:20 pm","10:21 pm","10:23 pm","10:25 pm","10:27 pm","10:28 pm","10:30 pm","10:32 pm","10:34 pm"],
    ["10:38 pm","10:41 pm","10:42 pm","10:43 pm","10:45 pm","10:47 pm","10:49 pm","10:50 pm","10:51 pm","10:53 pm","10:55 pm","10:57 pm","10:58 pm","11:00 pm","11:02 pm","11:04 pm"],
    ["11:08 pm","11:11 pm","11:12 pm","11:13 pm","11:15 pm","11:17 pm","11:19 pm","11:20 pm","11:21 pm","11:23 pm","11:25 pm","11:27 pm","11:28 pm","11:30 pm","11:32 pm","11:34 pm"],
    ["11:38 pm","11:41 pm","11:42 pm","11:43 pm","11:45 pm","11:47 pm","11:49 pm","11:50 pm","11:51 pm","11:53 pm","11:55 pm","11:57 pm","11:58 pm","12:00 am","12:02 am","12:04 am"],
    ["12:08 am","12:11 am","12:12 am","12:13 am","12:15 am","12:17 am","12:19 am","12:20 am","12:21 am","12:23 am","12:25 am","12:27 am","12:28 am","12:30 am","12:32 am","12:34 am"],
    ["12:38 am","12:41 am","12:42 am","12:43 am","12:45 am","12:47 am","12:49 am","12:50 am","12:51 am","12:53 am","12:55 am","12:57 am","12:58 am","1:00 am","1:02 am","1:04 am"],
];

let currentSchedule = 'daily';
let selectedStop = 'all';

function parseTime(str) {
    if (!str || typeof str !== 'string') return null;
    const clean = str.trim().toLowerCase().replace(/\s+/g, ' ');
    const match = clean.match(/(\d+):(\d+)\s*(am|pm)/);
    if (!match) return null;
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const period = match[3];
    if (period === 'pm' && h !== 12) h += 12;
    if (period === 'am' && h === 12) h = 0;
    return h * 60 + m;
}

function nowMinutes() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
}

function render() {
    const data = currentSchedule === 'daily' ? DAILY : NIGHT;
    const headerRow = document.getElementById('headerRow');
    const tableBody = document.getElementById('tableBody');
    const now = nowMinutes();
    const colsToShow = selectedStop === 'all' ? STOPS.map((_, i) => i) : [parseInt(selectedStop)];
    const stopIdx = selectedStop === 'all' ? 0 : parseInt(selectedStop);

    headerRow.innerHTML = '';
    const thNum = document.createElement('th');
    thNum.className = 'px-3 py-3 text-left text-xs font-semibold text-gray-400 sticky left-0 bg-gray-50 border-r border-gray-100 w-8';
    thNum.textContent = '#';
    headerRow.appendChild(thNum);
    colsToShow.forEach(i => {
        const th = document.createElement('th');
        th.className = 'px-4 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap min-w-[130px]';
        th.textContent = STOPS[i];
        headerRow.appendChild(th);
    });

    const timeRows = data.filter(r => Array.isArray(r));
    let nextTime = null;
    let nextTimeStr = '—';
    for (let i = 0; i < timeRows.length; i++) {
        const t = parseTime(timeRows[i][stopIdx]);
        if (t !== null && t >= now) { nextTime = t; nextTimeStr = timeRows[i][stopIdx]; break; }
    }

    const bannerStop = document.getElementById('bannerStop');
    const bannerTime = document.getElementById('bannerTime');
    const bannerCountdown = document.getElementById('bannerCountdown');
    if (selectedStop === 'all') {
        bannerStop.textContent = 'Select a stop to see your next ride';
        bannerTime.textContent = '—';
        bannerCountdown.textContent = '';
    } else {
        bannerStop.textContent = STOPS[stopIdx];
        bannerTime.textContent = nextTimeStr || 'No more today';
        if (nextTime !== null) {
            const diff = nextTime - now;
            bannerCountdown.textContent = diff === 0 ? 'Departing now!' : `in ${diff} min`;
        } else {
            bannerCountdown.textContent = 'Check back tomorrow';
        }
    }

    tableBody.innerHTML = '';
    let rideCount = 0;
    data.forEach(row => {
        const tr = document.createElement('tr');
        if (row === 'rest') {
            const td = document.createElement('td');
            td.colSpan = colsToShow.length + 1;
            td.className = 'px-4 py-1.5 bg-[#582C83]/5 border-y border-[#582C83]/10 text-center';
            td.innerHTML = '<span class="text-[10px] font-bold text-[#582C83]/50 uppercase tracking-widest">— shuttle rest —</span>';
            tr.appendChild(td);
        } else {
            rideCount++;
            const rowTime = parseTime(row[stopIdx]);
            const isNext     = selectedStop !== 'all' && rowTime === nextTime && nextTime !== null;
            const isPast     = rowTime !== null && rowTime < now;
            const isUpcoming = !isPast && !isNext && rowTime !== null && rowTime - now <= 60;

            if (isNext)          tr.className = 'bg-[#C8A051]/10 border-y border-[#C8A051]/30 transition';
            else if (isPast)     tr.className = 'opacity-35 transition border-b border-gray-50';
            else if (isUpcoming) tr.className = 'bg-green-50/60 transition border-b border-gray-50';
            else                 tr.className = 'hover:bg-gray-50 transition border-b border-gray-50';

            const tdNum = document.createElement('td');
            tdNum.className = 'px-3 py-3 text-xs font-mono text-gray-300 sticky left-0 bg-inherit border-r border-gray-100';
            tdNum.textContent = rideCount;
            tr.appendChild(tdNum);

            colsToShow.forEach(i => {
                const td = document.createElement('td');
                if (isNext) {
                    td.className = 'px-4 py-3 font-mono whitespace-nowrap font-black text-[#582C83] text-sm';
                    td.innerHTML = i === stopIdx
                        ? `${row[i]} <span class="text-[10px] bg-[#C8A051] text-white px-1.5 py-0.5 rounded-full font-bold uppercase ml-1">Next</span>`
                        : row[i];
                } else if (isPast) {
                    td.className = 'px-4 py-3 font-mono whitespace-nowrap text-gray-300 text-xs line-through';
                    td.textContent = row[i];
                } else {
                    td.className = 'px-4 py-3 font-mono whitespace-nowrap text-gray-700 text-xs';
                    td.textContent = row[i];
                }
                tr.appendChild(td);
            });
        }
        tableBody.appendChild(tr);
    });
}

function switchSchedule(type) {
    currentSchedule = type;
    const daily    = document.getElementById('btn-daily');
    const night    = document.getElementById('btn-night');
    const label    = document.getElementById('scheduleLabel');
    const range    = document.getElementById('scheduleRange');
    const active   = 'flex-1 py-3 text-sm font-semibold transition-all bg-[#582C83] text-white';
    const inactive = 'flex-1 py-3 text-sm font-semibold transition-all text-gray-500 hover:text-gray-800';
    if (type === 'daily') {
        daily.className = active; night.className = inactive;
        label.textContent = 'Mon – Fri Daily Schedule';
        range.textContent = '7:18 AM – 8:23 PM';
    } else {
        night.className = active; daily.className = inactive;
        label.textContent = 'Fri + Sat Night Schedule';
        range.textContent = '9:08 PM – 1:07 AM';
    }
    render();
}

document.getElementById('stopSelect').addEventListener('change', function () {
    selectedStop = this.value;
    render();
});

render();
setInterval(render, 60000);