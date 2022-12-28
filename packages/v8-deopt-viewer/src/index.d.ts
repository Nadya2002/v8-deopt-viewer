interface Options {
	out: string;
	timeout: number;
	["keep-internals"]: boolean;
	["skip-maps"]: boolean;
	open: boolean;
	input: string;
	path: string;
	view: boolean;
	template: string;
	["web-resource"]: string;
}

export default async function run(
	srcFile: string,
	options: Options
): Promise<void>;
