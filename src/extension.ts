import * as vscode from 'vscode';
import axios from 'axios';
import * as os from 'os';

async function downloadVersion(context: vscode.ExtensionContext, version: any) {
	return new Promise(async resolve => {
		// Determine the correct things to download based on the operating system
		let system = os.type();
		let downloads: string[] = [];
		switch (system) {
			case "Darwin": {
				// TODO(Arm1stice): Support Darwin tf-opt
			}
			case "Linux": {
				downloads.push('libtensorflow_framework.so.2')
				downloads.push('tf-opt-linux')
				break
			}
			case "Windows_NT": {
				// TODO(Arm1stice): Support Windows tf-opt
			}
		}

		let promises: Promise<null>[] = [];

		// Download each asset
		version.assets.forEach((asset: any) => {
			let promise: Promise<null> = new Promise(async (resolve) => {
				// Check if we need to download this asset
				if (downloads.indexOf(asset.name) != -1) {
					// TODO(Arm1stice): Remove the old version

					await vscode.window.withProgress(
						{
							location: vscode.ProgressLocation.Notification,
							title: `Downloading "${asset.name}"`
						},
						async (p) => {
							const { data, headers } = await axios({
								url: asset.url,
								method: 'GET',
								responseType: 'stream',
							});

							// TODO(Arm1stice): Write to the file

							data.on('close', () => {
								p.report({ increment: 100 })
							});
						});
					return resolve();
				} else {
					// No need to download, just resolve
					return resolve();
				}
			});
			promises.push(promise);
		});

		await Promise.all(promises);
		context.globalState.update('tfopt-version', version)
		return resolve();
	});
}

// Retrieve information about the latest version of tf-opt
async function getLatestVersion() {
	return new Promise(resolve => {
		axios.get('https://api.github.com/repos/mlir-visualizer/tf-opt/releases/latest')
			.then(result => {
				resolve(result.data);
			})
			.catch(err => {
				console.error("Error occurred while checking for updates")
				console.error(err);
				resolve(null);
			});
	});
}

// Check if the tf-opt tool is already downloaded
async function checkTfOpt(context: vscode.ExtensionContext) {
	return new Promise(async (resolve) => {
		let currentVersion: Date | undefined = context.globalState.get("tfopt-version");
		let latestVersion: any = await getLatestVersion();

		// If we failed to get the latest version, just return silently
		if (latestVersion == null) {
			return resolve(null)
		}

		let latestPublishDate = new Date(latestVersion.published_at);
		if (!currentVersion || latestPublishDate.getTime() > currentVersion.getTime()) {
			downloadVersion(context, latestVersion)
				.then(() => {
					console.log(`Updated tf-opt to version ${latestPublishDate}`)
					return resolve(null);
				})
				.catch((err: Error) => {
					return resolve(err);
				});
		} else {
			console.log(`tf-opt update to date at version ${currentVersion}`)
			return resolve(null)
		}
	});
}

export function activate(context: vscode.ExtensionContext) {
	let visualizer = vscode.commands.registerCommand('mlir-visualizer.visualize', () => {
		checkTfOpt(context).then(() => {
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
