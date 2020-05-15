import { createElement } from "preact";
import { DeoptsList } from "./DeoptsList";
import { CodePanel } from "./CodePanel";

/**
 * @typedef {{ fileId: string; entryId: string; }} RouteParams
 * @typedef {{ routeParams: RouteParams, fileDeoptInfo: import('..').V8DeoptInfoWithSources }} FileViewerProps
 * @param {FileViewerProps} props
 */
export const FileViewer = (props) => {
	return (
		<div>
			<CodePanel {...props} />
			<DeoptsList {...props} />
		</div>
	);
};