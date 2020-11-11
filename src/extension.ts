import axios from 'axios';
import * as child_process from 'child_process';
import * as diff from 'diff';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as tmp from 'tmp';
import * as vscode from 'vscode';

// A list of all the optimizations we need to run
let optimizationNames = [
	"tf-switch-fold",
	"tf-executor-graph-pruning",
	"tf-executor-island-coarsening",
	"tf-materialize-passthrough-op",
	"canonicalize",
	"tf-shape-inference",
	"tf-optimize"
];

async function downloadVersion(context: vscode.ExtensionContext, version: any) {
	return new Promise(async resolve => {
		// Determine the correct things to download based on the operating system
		let system = os.type();
		let downloads: string[] = [];
		switch (system) {
			case "Darwin": {
				// TODO: Support Darwin tf-opt
			}
			case "Linux": {
				downloads.push('tf-opt-linux')
				break
			}
			case "Windows_NT": {
				// TODO: Support Windows tf-opt
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
									// Set the file as executable
									fs.chmod(filePath, 0o777).then(resolve);
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
async function checkTfOpt(context: vscode.ExtensionContext): Promise<string> {
	return new Promise(async (resolve) => {
		// Get current version information from the global state
		let currentVersion: number | undefined = context.globalState.get("tfopt-version");
		let currentVersionDate = new Date(<number>currentVersion);

		// TODO: Set the binary path based on operating system
		let binaryPath = path.join(context.globalStorageUri.fsPath, "tf-opt-linux");

		let latestVersion: any = await getLatestVersion();
		// If we failed to get the latest version, just return silently
		if (latestVersion == null) {
			return resolve(binaryPath)
		}
		let latestPublishDate = new Date(latestVersion.published_at);

		if (!currentVersion || latestPublishDate.getTime() > currentVersionDate.getTime()) {
			// Download the newest version if necessary
			downloadVersion(context, latestVersion)
				.then(() => {
					console.log(`Updated tf-opt to version ${latestPublishDate}`)
					context.globalState.update('tfopt-version', latestPublishDate.getTime())
					return resolve(binaryPath);
				})
				.catch((err: Error) => {
					// TODO: Properly handle error
					return resolve(binaryPath);
				});
		} else {
			console.log(`tf-opt update to date at version ${currentVersion}`)
			return resolve(binaryPath);
		}
	});
}

async function runOptimizations(fileText: string, binaryPath: string, webview: vscode.Webview): Promise<string[]> {
	return new Promise(async (resolve) => {
		// Run all the optimizations through tf-opt
		let allOutput = [];
		let currentOutput = fileText;
		for (var i = 0; i < optimizationNames.length; i++) {
			// Show that optimization is in progress
			webview.html = `
			<html>
				<body>
					<br>
					Running optimization: ${optimizationNames[i]}...
				</body>
			</html>
			`

			let file = tmp.fileSync();
			fs.writeSync(file.fd, currentOutput);
			fs.close(file.fd);
			allOutput.push(currentOutput)
			currentOutput = await runTfOpt(binaryPath, file.name, optimizationNames[i]);
			file.removeCallback();
		}
		allOutput.push(currentOutput);

		// Return the original text and all the individual optimizations
		return resolve(allOutput);
	});
}

// Runs the tf-opt binary on some mlir code with 
async function runTfOpt(binaryPath: string, mlirFilePath: string, optimization: string): Promise<string> {
	return new Promise(resolve => {
		// TODO: Handle errors if this fails
		child_process.execFile(binaryPath, [mlirFilePath, `--${optimization}`], (err, stdout, stderr) => {
			if (err) throw err;
			return resolve(stdout.toString().trim());
		});
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

		checkTfOpt(context).then(async (binaryPath: string) => {
			const panel = vscode.window.createWebviewPanel(
				'opt-visualizer',
				// Cast is safe because we check if there is an active editor above
				'Visualizer: ' + path.basename(<string>vscode.window.activeTextEditor?.document.fileName),
				vscode.ViewColumn.Beside,
				{
					// Enable scripts in the webview
					enableScripts: true
				}
			);

			let fileText: string | undefined = vscode.window.activeTextEditor?.document.getText();
			if (!fileText) {
				vscode.window.showErrorMessage("Could not get code from the active editor")
				return
			}

			// Generate optimizations and diffs
			let optimizations = await runOptimizations(fileText, binaryPath, panel.webview);
			let diffedOptimizations = [];
			diffedOptimizations.push(optimizations[0]);
			for (var i = 1; i < optimizations.length; i++) {
				let optDiff = diff.diffWordsWithSpace(optimizations[i - 1], optimizations[i]);
				let optDiffHtml = '';
				for (var j = 0; j < optDiff.length; j++) {
					let part = optDiff[j];
					if (part.added) {
						optDiffHtml += `<span style='background-color: green'>${part.value}</span>`;
					} else if (part.removed) {
						optDiffHtml += `<span style='background-color: red'>${part.value}</span>`;
					} else {
						optDiffHtml += part.value;
					}
				}
				diffedOptimizations.push(optDiffHtml)
			}

			let bodyHtml = ``
			for (var i = 0; i < optimizations.length; i++) {
				bodyHtml += `
				<div>
					<h1>${i == 0 ? `Original Code` : `Optimization ${optimizationNames[i - 1]}`}</h1>
					<div>
						<pre>
							<code class="plaintext">
${diffedOptimizations[i]}
							</code>
						</pre>
					</div>
				</div>
				`
			}
			let finalHtml = `
<!DOCTYPE html>
<html>
	<head>
	<meta
		http-equiv="Content-Security-Policy"
		content="default-src 'none'; img-src ${panel.webview.cspSource} https:; script-src ${panel.webview.cspSource} https: 'unsafe-inline'; style-src ${panel.webview.cspSource} https: 'unsafe-inline';"
  	/>
	</head>
	${bodyHtml}
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/10.3.2/styles/codepen-embed.min.css">
	<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/10.3.2/highlight.min.js"></script>
	<script>
		hljs.initHighlightingOnLoad();
	</script>
</html>
`
			panel.webview.html = finalHtml;
		})
	});

	context.subscriptions.push(visualizer);
}

// this method is called when your extension is deactivated
export function deactivate() { }
