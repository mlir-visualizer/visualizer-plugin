import axios from 'axios';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

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
					// Remove the old version
					let filePath = path.join(context.globalStorageUri.fsPath, asset.name);
					await fs.remove(filePath)

					// Download the new version using a progress bar
					await vscode.window.withProgress(
						{
							location: vscode.ProgressLocation.Notification,
							title: `Downloading "${asset.name}"`
						},
						(p) => {
							return new Promise(async (resolve) => {
								// Start the download stream
								const { data, headers } = await axios({
									url: asset.browser_download_url,
									method: 'GET',
									responseType: 'stream',
								});
	
								// Pipe to file stream
								let stream = fs.createWriteStream(filePath)
								data.pipe(stream)
								data.on('close', () => {
									p.report({ increment: 100 })
									stream.close()
									resolve()
								});
							})
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
		// Get current version information from the global state
		let currentVersion: number | undefined = context.globalState.get("tfopt-version");
		let currentVersionDate = new Date(<number>currentVersion);

		
		let latestVersion: any = await getLatestVersion();
		// If we failed to get the latest version, just return silently
		if (latestVersion == null) {
			return resolve(null)
		}
		let latestPublishDate = new Date(latestVersion.published_at);

		if (!currentVersion || latestPublishDate.getTime() > currentVersionDate.getTime()) {
			// Download the newest version if necessary
			downloadVersion(context, latestVersion)
				.then(() => {
					console.log(`Updated tf-opt to version ${latestPublishDate}`)
					context.globalState.update('tfopt-version', latestPublishDate.getTime())
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
	let visualizer = vscode.commands.registerCommand('mlir-visualizer.visualize', async () => {
		// Check if there is an active text editor and if it is an MLIR file
		if (!vscode.window.activeTextEditor || path.extname(vscode.window.activeTextEditor?.document.fileName) != '.mlir') {
			vscode.window.showErrorMessage("Command must be run on an MLIR file")
			return
		}

		// Check if our storage path exists, create it if it doesn't
		if (!await fs.pathExists(context.globalStorageUri.fsPath)) {
			await fs.mkdir(context.globalStorageUri.fsPath)
		}

		checkTfOpt(context).then(() => {
			const panel = vscode.window.createWebviewPanel(
				'opt-visualizer', // Identifies the type of the webview. Used internally
				'MLIR Visualizer', // Title of the panel displayed to the user
				vscode.ViewColumn.Beside, // Editor column to show the new webview panel in.
				{}
			);

			// Show that optimization is in progress
			panel.webview.html = `
			<html>
				<body>
					Optimization in progress...
				</body>
			</html>
			`
			
			// TODO(Arm1stice): Perform the optimizations in order and store them in the workspace context
			// TODO(Arm1stice): Render the webview that shows the optimizations
		})
	});

	context.subscriptions.push(visualizer);
}

// this method is called when your extension is deactivated
export function deactivate() { }
