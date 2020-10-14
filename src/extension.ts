import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	// console.log('MLIR Visualizer activated');
	// console.log(context.globalStorageUri)

	let visualizer = vscode.commands.registerCommand('mlir-visualizer.visualize', () => {

		vscode.window.showInformationMessage('Hello World from mlir-visualizer!');
		vscode.window.showInformationMessage('' + context.globalStorageUri);

		const panel = vscode.window.createWebviewPanel(
			'opt-visualizer', // Identifies the type of the webview. Used internally
			'MLIR Visualizer', // Title of the panel displayed to the user
			vscode.ViewColumn.Beside, // Editor column to show the new webview panel in.
			{} // Webview options. More on these later.
		);
	});

	context.subscriptions.push(visualizer);
}

// this method is called when your extension is deactivated
export function deactivate() { }
