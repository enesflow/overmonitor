const si = require("systeminformation");
const chalk = require("chalk");
const figlet = require("figlet");
const clui = require("clui");
const format = require("format-duration");
const {table} = require("table");

const langs = {
	en: {
		err: "Something went wrong...",
		loading: "Please wait...",
		mem: "Memory Usage :",
		swp: "Swap Usage :",
		cpu: "CPU Usage :",
		upt: "Uptime :",
		cpt: "CPU Temperature :",
		gpu: "GPU Usage :",
		gpn: "GPU Usage Unknown",
		ndw: "Network Download :",
		nup: "Network Upload :",

		nameG: "Name",
		cpuG: "CPU",
		memoryG: "Memory",
		commandG: "Command",

		noProcesses:
			"Not enough space to show processes, please resize your terminal",
	},
};
const lang = "en";
const delay = 1000;

let chars = 20;
let ascii_text = "overmonitor";
let timer;
let lastLoopTime;
const Gauge = clui.Gauge;
const Sparkline = clui.Sparkline;

let memoryValues = [];
let swapValues = [];
let cpuValues = [];
let cpuTemperatureValues = [];
let networkDownValues = [];
let networkUpValues = [];
let gpuValues = {};

let networkDown;
let networkUp;

//progress | graph
let style = "progress";

let globalPrint = [];

const getName = (name, newLine = true, width = chars) => {
	let result = name + " ".repeat(Math.max(0, width - name.length));
	result =
		result.length > width ? result.substring(0, width - 3) + ".. " : result;
	return (newLine ? "\n" : "") + result;
};

const progress = (rawData, infoSymbol, crit = 80) => {
	let char = "█";
	data = Math.round(rawData / (100 / chars)) ?? 0;
	return `|${
		rawData < crit
			? chalk.green(char.repeat(data))
			: chalk.red(char.repeat(data))
	}${"⣿".repeat(chars - data)}| ${rawData}${infoSymbol}`;
};

const clear = () => {
	process.stdout.write("\x1Bc");
};

const sortDictArray = (arr, dictProperty) => {
	let temp = arr;
	temp.sort((a, b) => {
		return b[dictProperty] - a[dictProperty];
	});
	return temp;
};

console.log("Please wait... ");

figlet.text(
	ascii_text,
	{
		font: "Small",
		horizontalLayout: "default",
		verticalLayout: "default",
		whitespaceBreak: true,
	},
	function (err, data) {
		if (err) {
			console.log(langs[lang].err);
			console.dir(err);
			return;
		}
		ascii_text = data;

		(async () => {
			main();
		})();
	}
);

const main = async () => {
	let deviceName;
	let cpus;
	let currentLoad;
	let cpuTemperature;
	let processes;
	let processTable;
	let memoryHuman;
	let swapHuman;
	globalPrint = [];

	chars = Math.round(process.stdout.columns / 3);

	let osInfoPromise = si.osInfo().then((data) => {
		deviceName = getName(data.distro + " " + data.release, false);
	});

	let memoryPromise = si.mem().then((data) => {
		let memoryAvailable;
		let memoryTotal;
		let swapAvailable;
		let swapTotal;
		memoryAvailable = data.available;
		memoryTotal = data.total;
		swapAvailable = data.swapfree;
		swapTotal = data.swaptotal;
		memoryHuman = Math.round(100 - (memoryAvailable / memoryTotal) * 100);
		swapHuman = Math.round(100 - (swapAvailable / swapTotal) * 100);
	});

	let currentLoadPromise = si.currentLoad().then((data) => {
		cpus = data.cpus;
		currentLoad = 0;
		cpus.forEach((cpu) => {
			currentLoad += cpu.load / 8;
		});
		currentLoad = Math.round(currentLoad);
	});

	let cpuTemperaturePromise = si.cpuTemperature().then((data) => {
		cpuTemperature = data.main;
	});

	let graphicsPromise = si.graphics().then((data) => {
		data.controllers.forEach((gpu) => {
			let gpuName = gpu.vendor + " " + gpu.model;
			if (!gpuValues.hasOwnProperty(gpuName)) {
				gpuValues[gpuName] = [];
			}
			let gpuUsage = Math.round(
				100 - (gpu.memoryFree / gpu.memoryTotal) * 100
			);
			gpuValues[gpuName].push(gpuUsage);
		});
	});

	let processesPromise = si.processes().then((data) => {
		let rawProcesses = sortDictArray(data.list, "cpu");
		processes = [];
		rawProcesses.forEach((p) => {
			let newValue = false;
			processes.forEach((sp) => {
				if (p.name == sp.name) {
					sp.mem += p.mem;
					sp.cpu += p.cpu;
					newValue = true;
				}
			});
			if (!newValue) {
				processes.push(p);
			}
		});
	});

	let networkStatsPromise = si.networkStats().then((data) => {
		networkDown = 0;
		networkUp = 0;
		data.forEach((netDevice) => {
			networkDown +=
				netDevice.rx_sec / (1000 / netDevice.ms) / (1024 * 1024);

			networkUp +=
				netDevice.tx_sec / (1000 / netDevice.ms) / (1024 * 1024);
		});
		networkDown = networkDown.toFixed(1);
		networkUp = networkUp.toFixed(1);
	});

	await Promise.allSettled([
		osInfoPromise,
		memoryPromise,
		graphicsPromise,
		currentLoadPromise,
		cpuTemperaturePromise,
		processesPromise,
		networkStatsPromise,
	]);

	processTable = [
		[
			getName(
				langs[lang].nameG,
				false,
				Math.floor(chars / langs[lang].nameG.length)
			),
			chalk.green(
				getName(
					langs[lang].cpuG,
					false,
					Math.floor(chars / langs[lang].nameG.length)
				)
			),
			getName(
				langs[lang].memoryG,
				false,
				Math.floor(chars / langs[lang].nameG.length)
			),
			getName(langs[lang].commandG, false),
		],
	];

	processes
		.slice(0, Math.floor(Math.max((process.stdout.rows - 28) / 2.2, 0)))
		.forEach((p) => {
			processTable.push([
				getName(
					p.name,
					false,
					Math.floor(chars / 1.2 / (processTable[0].length - 1))
				).trim(),
				Math.min(100, Math.round(p.cpu * 10) / 10).toFixed(1) + "%",
				Math.min(100, Math.round(p.mem * 10) / 10).toFixed(1) + "%",
				getName(p.command + " " + p.params, false, chars / 1.2),
			]);
		});

	//append to array
	memoryValues.push(memoryHuman);
	swapValues.push(swapHuman);
	cpuValues.push(currentLoad);
	cpuTemperatureValues.push(cpuTemperature);
	networkDownValues.push(networkDown);
	networkUpValues.push(networkUp);

	//print results

	globalPrint.push([ascii_text]);
	globalPrint.push([deviceName]);
	globalPrint.push([
		getName(langs[lang].upt),
		format(Math.floor(si.time().uptime) * 1000),
	]);

	if (style == "progress") {
		globalPrint.push([
			getName(langs[lang].mem),
			progress(memoryValues[memoryValues.length - 1], "%"),
		]);
		globalPrint.push([
			getName(langs[lang].swp),
			progress(swapValues[swapValues.length - 1], "%"),
		]);
		globalPrint.push([
			getName(langs[lang].cpu),
			progress(cpuValues[cpuValues.length - 1], "%"),
		]);
		globalPrint.push([
			getName(langs[lang].cpt),
			progress(
				cpuTemperatureValues[cpuTemperatureValues.length - 1],
				"°"
			),
		]);
		globalPrint.push();
		for (const [key, value] of Object.entries(gpuValues)) {
			globalPrint.push([
				getName(key),
				value[value.length - 1] >= 0
					? progress(value[value.length - 1], "%")
					: langs[lang].gpn,
			]);
		}
		globalPrint.push([]);
		globalPrint.push([
			getName(langs[lang].ndw),
			progress(networkDown, " MB/s"),
		]);
		globalPrint.push([
			getName(langs[lang].nup),
			progress(networkUp, " MB/s"),
		]);
	}
	if (style == "graph") {
		globalPrint.push([
			getName(langs[lang].mem),
			Sparkline(memoryValues, "%"),
		]);
		globalPrint.push([
			getName(langs[lang].swp),
			Sparkline(swapValues, "%"),
		]);
		globalPrint.push([getName(langs[lang].cpu), Sparkline(cpuValues, "%")]);
		globalPrint.push([
			getName(langs[lang].cpt),
			Sparkline(cpuTemperatureValues, "°"),
		]);
		globalPrint.push([]);
		for (const [key, value] of Object.entries(gpuValues)) {
			globalPrint.push([
				getName(key),
				value[value.length - 1] >= 0
					? Sparkline(value, "%")
					: langs[lang].gpn,
			]);
		}
		globalPrint.push([]);
		globalPrint.push([
			getName(langs[lang].ndw),
			Sparkline(networkDownValues, " MB/s"),
		]);
		globalPrint.push([
			getName(langs[lang].nup),
			Sparkline(networkUpValues, " MB/s"),
		]);
	}

	//we do this so that the array cant be massive
	if (memoryValues.length > chars) {
		memoryValues = memoryValues.slice(memoryValues.length - chars);
		swapValues = swapValues.slice(swapValues.length - chars);
		cpuValues = cpuValues.slice(cpuValues.length - chars);
		cpuTemperatureValues = cpuTemperatureValues.slice(
			cpuTemperatureValues.length - chars
		);
		for (const [key, value] of Object.entries(gpuValues)) {
			gpuValues[key] = value.slice(value.length - chars);
		}
		networkDownValues = networkDownValues.slice(
			networkDownValues.length - chars
		);
		networkUpValues = networkUpValues.slice(networkUpValues.length - chars);
	}

	globalPrint.push([
		table(processTable, {
			border: {
				topBody: "─",
				topJoin: "-",
				topLeft: "┌",
				topRight: "┐",

				bottomBody: "─",
				bottomJoin: "-",
				bottomLeft: "└",
				bottomRight: "┘",

				bodyLeft: "│",
				bodyRight: "│",
				bodyJoin: "|",

				joinBody: "-",
				joinLeft: "├",
				joinRight: "┤",
				joinJoin: "-",
			},
			columnDefault: {
				width: Math.floor(chars / 1.2 / (langs[lang].nameG.length - 1)),
			},
			columns: {
				3: {width: Math.floor(chars / 1.2)},
			},
		}).trim(),
	]);

	if (Math.floor(Math.max((process.stdout.rows - 28) / 2.2, 0)) == 0) {
		globalPrint.push([langs[lang].noProcesses]);
	}

	//print things like messages and stuff like that
	if (globalPrint) {
		clear();
		globalPrint.forEach((toPrint) => {
			if (toPrint.length > 0) {
				console.log(toPrint.join(" "));
			} else {
				console.log("\n");
			}
		});
	}
	lastLoopTime = Date.now() / 1000;
	timer = setTimeout(main, delay);
};
