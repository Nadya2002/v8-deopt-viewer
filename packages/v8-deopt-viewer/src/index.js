import * as path from "path";
import { open as openFile, readFile, writeFile, copyFile, mkdir } from "fs/promises";
import { createReadStream } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import open from "open";
import { get } from "httpie/dist/httpie.mjs";
import { generateV8Log } from "v8-deopt-generate-log";
import { parseV8LogStream, groupByFile } from "v8-deopt-parser";
import { determineCommonRoot } from "./determineCommonRoot.js";

// TODO: Replace with import.meta.resolve when stable
import { createRequire } from "module";

// @ts-ignore
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, "template.html");

let pathToweb4, view;

/**
 * @param {import('v8-deopt-parser').PerFileV8DeoptInfo["files"]} deoptInfo
 * @returns {Promise<Record<string, import('v8-deopt-webapp/src/index').V8DeoptInfoWithSources>>}
 */
async function addSources(deoptInfo) {
	const files = Object.keys(deoptInfo);
	const root = determineCommonRoot(files);

	let arr = [];

	/** @type {Record<string, import('v8-deopt-webapp/src/index').V8DeoptInfoWithSources>} */
	let result = Object.create(null);
	for (let file of files) {
		const fileDepotInfo = deoptInfo[file];
		let info = {
			codes: [0, 0, 0],
			deopts: [0, 0, 0],
			ics: [0, 0, 0],
		};

		for (let kind of ["codes", "deopts", "ics"]) {
			const entries = fileDepotInfo[kind];
			for (let entry of entries) {
				info[kind][entry.severity - 1]++;
			}
		}

		let count = info["deopts"][1] + info["deopts"][2] + info["ics"][1] + info["ics"][2];
		arr.push([file, count]);
		if (count > 0 || view) {
			let srcPath;

			let src, srcError;
			let relativePath;

			if (pathToweb4 == undefined) {
				if (file.startsWith("https://") || file.startsWith("http://")) {
					try {
						srcPath = file;
						const { data } = await get(file);
						src = data;
					} catch (e) {
						srcError = e;
					}
				} else {
					let filePath = file;
					if (file.startsWith("file://")) {
						// Convert Linux-like file URLs for Windows and assume C: root. Useful for testing
						if (
							process.platform == "win32" &&
							!file.match(/^file:\/\/\/[a-zA-z]:/)
						) {
							filePath = fileURLToPath(file.replace(/^file:\/\/\//, "file:///C:/"));
						} else {
							filePath = fileURLToPath(file);
						}
					}

					if (path.isAbsolute(filePath)) {
						try {
							srcPath = filePath;
							src = await readFile(filePath, "utf8");
						} catch (e) {
							srcError = e;
						}
					} else {
						srcError = new Error("File path is not absolute");
					}
				}

				relativePath = root ? file.slice(root.length) : file;
			} else {
				let file1 = file;
				let regexReportRender = /report-render/;
				let index = file1.search(regexReportRender);
				// console.log(index + " " + file1);
				let myRelative = null;
				if (index !== -1) {
					// console.log("Find!" + index);
					myRelative = file1.slice(index);
					file1 = pathToweb4 + "report-renderer/" + file1.slice(index);
					// console.log("render = " + file1);
				} else {
					let regex = new RegExp("/place/db/iss3/instances/renderer-load-test-22_renderer_load_test_gELnJxNKudV/courier-data/unpacked-resources/templates-web4.tar.gz_df611ad55574a6d1becf697a198eff80/7f0f097c4610c46659adfc85e5b21c7f/");
					myRelative = file1.replace(regex, "");
					file1 = pathToweb4 + "web4/" + myRelative;
					// console.log(file1);
				}

				let filePath = file1;
				try {
					srcPath = filePath;
					src = await readFile(filePath, "utf8");
				} catch (e) {
					srcError = e;
				}

				relativePath = myRelative;
			}

			if (srcError) {
				result[file] = {
					...deoptInfo[file],
					relativePath,
					srcPath,
					srcError: srcError.toString(),
				};
			} else {
				result[file] = {
					...deoptInfo[file],
					relativePath,
					srcPath,
					src,
				};
			}
		}
	}

	arr.sort((a, b) => b[1] - a[1]);
	let obj = {};
	for (let file of arr) {
		obj[file[0]] = result[file[0]];
	}

	return obj;
}

/**
 * @param {string} srcFile
 * @param {import('.').Options} options
 */
export default async function run(srcFile, options) {
	let logFilePath;
	if (srcFile) {
		console.log("Running and generating log...");
		logFilePath = await generateV8Log(srcFile, {
			logFilePath: path.join(options.out, "v8.log"),
			browserTimeoutMs: options.timeout,
			traceMaps: !options["skip-maps"],
		});
	} else if (options.input) {
		logFilePath = path.isAbsolute(options.input)
			? options.input
			: path.join(process.cwd(), options.input);
	} else {
		throw new Error(
			'Either a file/url to generate a log or the "--input" flag pointing to a v8.log must be provided'
		);
	}

	// Ensure output directory exists
	await mkdir(options.out, { recursive: true });

	console.log("Parsing log...");

	const fd = await openFile(logFilePath);
	const { buffer: logContentsSlice } = await fd.read({ length: 16 * 1024 });
	await fd.close();

	// New IC format has 10 values instead of 9
	// todo parse first line - v8-version,8,4,371,19,-node.18,0, instead 
	// https://github.com/andrewiggins/v8-deopt-viewer/issues/47
	const hasNewIcFormat = /\w+IC(,.*){10}/.test(logContentsSlice.toString());

	// Error: Cannot create a string longer than 0x1fffffe8 characters
	// 0x1fffffe8 = ~512 * 2 ** 20
	// 64 * 2 ** 20 (~64 mb) seems to be safe enough
	const logContentsStream = await createReadStream(
		logFilePath,
		{ encoding: 'utf8', highWaterMark: 16 * 1024 },
	);
	const rawDeoptInfo = await parseV8LogStream(logContentsStream, {
		keepInternals: options["keep-internals"],
		hasNewIcFormat,
	});

	console.log("Adding sources...");
	pathToweb4 = options.path;
	view = options.view;
	// Group DeoptInfo by files and extend the files data with sources
	const groupDeoptInfo = groupByFile(rawDeoptInfo);
	const deoptInfo = {
		...groupDeoptInfo,
		files: await addSources(groupDeoptInfo.files),
	};

	const deoptInfoString = JSON.stringify(deoptInfo, null, 2);
	const jsContents = `window.V8Data = ${deoptInfoString};`;
	await writeFile(path.join(options.out, "v8-data.js"), jsContents, "utf8");

	console.log("Generating webapp...");
	const template = await readFile(templatePath, "utf8");
	const indexPath = path.join(options.out, "index.html");
	await writeFile(indexPath, template, "utf8");

	// @ts-ignore
	const require = createRequire(import.meta.url);
	const webAppIndexPath = require.resolve("v8-deopt-webapp");
	const webAppStylesPath = webAppIndexPath.replace(/.js$/g, ".css");
	await copyFile(webAppIndexPath, path.join(options.out, "v8-deopt-webapp.js"));
	await copyFile(
		webAppStylesPath,
		path.join(options.out, "v8-deopt-webapp.css")
	);

	if (options.open) {
		await open(pathToFileURL(indexPath).toString(), { url: true });
		console.log(
			`Done! Opening ${path.join(options.out, "index.html")} in your browser...`
		);
	} else {
		console.log(
			`Done! Open ${path.join(options.out, "index.html")} in your browser.`
		);
	}
}
