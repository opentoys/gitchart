#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const dayms = 3600 * 1000 * 24;
const linedata = [];

let filename = "gitdate.json";
let today = Date.now();
let max = 0;
let args = parseArgs(process.argv.slice(2))

if (args.start) today = new Date(args.end).getTime()
if (args.end) max = new Date(args.start).getTime()
if (args.cache) filename = args.cache

function parseArgs(args) {
	var obj = {};
	for (let i = 0; i < args.length; i++) {
		if (i + 1 > args.length) return obj;
		var slp = args[i].split('=')
		if (args[i] == slp[0]) {
			obj[String(args[i]).replace(/-/g, '')] = args[i + 1]
			i++
			continue
		}
		obj[slp[0].replace(/-/g, '')] = slp[1]
	}
	return obj
}

let keys = Object.keys(args);
if (keys.includes('h') || keys.includes('help')) {
	console.log('gitchart help info:')
	console.log('  gitchart alias gitstat.')
	console.log(' ')
	console.log('  run as: gitchart command')
	console.log(' ')
	console.log('    -h,--help      ouput help info.')
	console.log('    --start        The earliest time to start the analysis.(default first git commit date)')
	console.log('    --end          Deadline for analysis.(default today)')
	console.log('    --exclude      Deadline for analysis.(default null)')
	console.log('    --include      Deadline for analysis.(default null)')
	console.log('    --cache        Analyze the cache of the file, not when the file exists.(default gitdate.json)')
	console.log(' ')
	process.exit(0);
}

console.log(args)

if (!fs.existsSync(filename)) {
	if (!max) max = new Date(execSync(`git log --reverse --no-merges --pretty=format:'%ai' | sed -n 1p`).toString()).getTime()
	gitlog(today, max)
} else {
	linedata.push(...require("./" + filename))
}

if (args.output || args.o) {
	fs.writeFileSync(args.output || args.o, reanderhtml())
	console.log(`file writen success. at ${process.cwd() + "/" + (args.output || args.o)}`)
	process.exit(0);
}

console.log("service staring...");
const server = http.createServer((req, res) => {
	const url = new URL(req.url, `http://${req.headers.host}`);
	const start = url.searchParams.get('start') || null;
	const end = url.searchParams.get('end') || null;
	const hidden = url.searchParams.get('hidden');
	res.write(reanderhtml(start, end, hidden));
	res.end();
})

server.listen(args.port || 0, () => {
	console.log(`server is running at port: http://127.0.0.1:${server.address().port}?start=&end=&hidden=`)
})

function reanderhtml(start, end, hidden) {
	const arr = [];
	arr.push(['Line', 'Date', 'Operate']);

	var total = 0;
	linedata.reverse();
	for (let item of linedata) {
		if (item.date > end || item.date < start) continue;
		var day = Number(item.date.replace(/-/g, ''))
		if (!hidden || !hidden.includes('add')) arr.push([Number(item.added) || 0, day, 'add'])
		if (!hidden || !hidden.includes('delete')) arr.push([Number(item.removed) || 0, day, 'delete'])
		if (!hidden || !hidden.includes('total')) {
			total += (Number(item.total) || 0);
			arr.push([total, day, 'total'])
		}
	}
	return append(JSON.stringify(arr));
}

function gitlog(now, max) {
	function format(ms) {
		var date = new Date(ms)
		var year = date.getFullYear()
		var month = date.getMonth() + 1
		var day = date.getDate()
		return `${year}-${month > 9 ? month : '0' + month}-${day > 9 ? day : '0' + day}`
	}
	var maxday = Math.ceil((now - max) / dayms)

	console.log("Statistics...");
	for (let i = 1; i <= maxday; i++) {
		var start = format(now - 3600 * 1000 * 24 * i)
		var end = format(now - 3600 * 1000 * 24 * (i - 1))
		var item = exec(start, end)
		linedata.push(item)
	}

	function exec(start, end) {
		const obj = { added: 0, removed: 0, total: 0, date: end }
		try {
			const cliarr = [`git log --since=${start} --until=${end} --pretty=tformat: --numstat`];
			if (args.exclude) cliarr.push(args.exclude.split(',').map(v => `grep -v ${v}`).join(' | '))
			if (args.include) cliarr.push(args.include.split(',').map(v => `grep -e ${v}`).join(' | '))
			const result = execSync(cliarr.join(' | ')).toString();
			result.split('\n').filter(v => v != '').forEach(v => {
				var cnt = v.split('\t');
				obj.added += Number(cnt[0]) || 0;
				obj.removed += Number(cnt[1]) || 0;
			})
			obj.total += (obj.added - obj.removed);
		} catch (e) { }
		return obj;
	}
	fs.writeFileSync(filename, JSON.stringify(linedata))
}

function append(data) {
	return `
<!DOCTYPE html>
<html lang="zh-CN" style="height: 100%">
<head>
<meta charset="utf-8">
</head>
<body style="height: 100%; margin: 0">
<div id="container" style="height: 100%"></div>
<script type="text/javascript" src="https://fastly.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"></script>
<script type="text/javascript" src="https://fastly.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
<script>
var _rawData = ${data}
</script>
<script type="text/javascript">
var dom = document.getElementById('container');
var myChart = echarts.init(dom, null, {
  renderer: 'canvas',
  useDirtyRect: false
});
var app = {};
var option;
run(_rawData);
function run(_rawData) {
  const operates = [
    'add',
    'delete',
    'total',
  ];
  const datasetWithFilters = [];
  const seriesList = [];
  echarts.util.each(operates, function (operate) {
    var datasetId = 'dataset_' + operate;
    datasetWithFilters.push({
      id: datasetId,
      fromDatasetId: 'dataset_raw',
      transform: {
        type: 'filter',
        config: {
          and: [
            { dimension: 'Date', gte: 20210301 },
            { dimension: 'Operate', '=': operate }
          ]
        }
      }
    });
    seriesList.push({
      type: 'line',
      datasetId: datasetId,
      showSymbol: false,
      name: operate,
      endLabel: {
        show: true,
        formatter: function (params) {
          return params.value[2] + ': ' + params.value[0];
        }
      },
      labelLayout: {
        moveOverlap: 'shiftY'
      },
      emphasis: {
        focus: 'series'
      },
      encode: {
        x: 'Date',
        y: 'Line',
        label: ['Operate', 'Line'],
        itemName: 'Date',
        tooltip: ['Line']
      }
    });
  });
  option = {
    animationDuration: 10000,
    dataset: [
      {
        id: 'dataset_raw',
        source: _rawData
      },
      ...datasetWithFilters
    ],
    title: {
      text: ''
    },
    tooltip: {
      order: 'valueDesc',
      trigger: 'axis'
    },
    xAxis: {
      type: 'category',
      nameLocation: 'middle'
    },
    yAxis: {
      name: 'Line'
    },
    grid: {
      right: 140
    },
    series: seriesList
  };
  myChart.setOption(option);
}

if (option && typeof option === 'object') {
  myChart.setOption(option);
}
window.addEventListener('resize', myChart.resize);
</script>
</body>
</html>`
};
