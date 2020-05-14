import { createElement, Fragment } from "preact";
import { useMemo } from "preact/hooks";
import spectre from "../spectre.scss";
import styles from "./SummaryTable.scss";

/**
 * @typedef {[number, number, number]} SeveritySummary
 * @typedef {{ codes: SeveritySummary; deopts: SeveritySummary; ics: SeveritySummary }} FileSeverities
 * @param {import('..').AppProps["deoptInfo"]} deoptInfo
 * @returns {Record<string, FileSeverities>}
 */
function getPerFileStats(deoptInfo) {
	/** @type {Record<string, FileSeverities>} */
	const results = {};

	const files = Object.keys(deoptInfo);
	for (let fileName of files) {
		const fileDepotInfo = deoptInfo[fileName];
		results[fileName] = {
			codes: [0, 0, 0],
			deopts: [0, 0, 0],
			ics: [0, 0, 0],
		};

		for (let kind of ["codes", "deopts", "ics"]) {
			const entries = fileDepotInfo[kind];
			for (let entry of entries) {
				results[fileName][kind][entry.severity - 1]++;
			}
		}
	}

	return results;
}

/**
 * @param {import('..').AppProps} props
 */
export function SummaryTable({ deoptInfo }) {
	const perFileStats = useMemo(() => getPerFileStats(deoptInfo), [deoptInfo]);

	return (
		<table
			id={styles.summaryTable}
			class={[
				spectre.table,
				spectre["table-scroll"],
				spectre["table-stripped"],
				spectre["table-hover"],
			].join(" ")}
		>
			<thead>
				<tr class={styles.headers}>
					<th>File</th>
					<th class={styles.codes} colspan="3">
						Optimizations
					</th>
					<th class={styles.deopts} colspan="3">
						Deoptimizations
					</th>
					<th class={styles.ics} colspan="3">
						Inline Caches
					</th>
				</tr>
				<tr class={styles.subheaders}>
					<th></th>
					<CodeHeaders />
					<SeverityHeaders />
					<SeverityHeaders />
				</tr>
			</thead>
			<tbody>
				{Object.keys(perFileStats).map((fileName) => {
					const summaryInfo = perFileStats[fileName];

					return (
						<tr class={styles.fileRow}>
							<td class={styles.fileName}>
								<a>{deoptInfo[fileName].relativePath}</a>
							</td>
							<SeveritySummary class="codes" severities={summaryInfo.codes} />
							<SeveritySummary class="deopts" severities={summaryInfo.deopts} />
							<SeveritySummary class="ics" severities={summaryInfo.ics} />
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}

function CodeHeaders() {
	return (
		<Fragment>
			<th>Optimized</th>
			<th>Optimizable</th>
			<th>Sev 3</th>
		</Fragment>
	);
}

function SeverityHeaders() {
	return (
		<Fragment>
			<th>Sev 1</th>
			<th>Sev 2</th>
			<th>Sev 3</th>
		</Fragment>
	);
}

function SeveritySummary(props) {
	return (
		<Fragment>
			{props.severities.map((severityCount) => {
				return <td>{severityCount}</td>;
			})}
		</Fragment>
	);
}