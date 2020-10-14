import * as vscode from 'vscode';

// Check if the tf-opt tool is already downloaded
async function checkTfOpt(path: vscode.Uri) {
	return new Promise((resolve, reject) => {
		// TODO(Arm1stice): Check if the tool is downloaded
		resolve(true)
	});
}

export function activate(context: vscode.ExtensionContext) {
	let visualizer = vscode.commands.registerCommand('mlir-visualizer.visualize', () => {
		checkTfOpt(context.globalStorageUri).then(hasTool => {
			return new Promise(resolve => {
				if (hasTool === true) {
					resolve();
				} else {
					// TODO(Arm1stice): Download the tool
				}
			});
		})
			.then(() => {
				vscode.window.showInformationMessage('Hello World from mlir-visualizer!');
				vscode.window.showInformationMessage('' + context.globalStorageUri);

				const panel = vscode.window.createWebviewPanel(
					'opt-visualizer', // Identifies the type of the webview. Used internally
					'MLIR Visualizer', // Title of the panel displayed to the user
					vscode.ViewColumn.Beside, // Editor column to show the new webview panel in.
					{} // Webview options. More on these later.
				);

				// TODO(Arm1stice): Set the webview to the webpage showing that the optimization is in progress
				// TODO(Arm1stice): Perform the optimizations in order and store them in the workspace context
				// TODO(Arm1stice): Render the webview that shows the optimizations
			})
	});

	context.subscriptions.push(visualizer);
}

// this method is called when your extension is deactivated
export function deactivate() { }
