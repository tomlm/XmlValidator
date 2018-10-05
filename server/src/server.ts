/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
/* strict=false */
/* tslint:disable */
import { SpawnOptions } from 'child_process';
import * as path from 'path';
import { CompletionItem, CompletionItemKind, createConnection, Diagnostic, DiagnosticSeverity, DidChangeConfigurationNotification, InitializeParams, Position, ProposedFeatures, TextDocument, TextDocumentPositionParams, TextDocuments } from 'vscode-languageserver';
import { spawnAsync } from './processUtils';

interface XsdError {
	Severity: string;
	Message: string;
	LineNumber: number;
	LinePosition: number;
};

interface XsdValidateResponse {
	Errors: XsdError[],
	Recommendations: string[]
}

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
// let hasDiagnosticRelatedInformationCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
	let capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we will fall back using global settings
	hasConfigurationCapability =
		capabilities.workspace && !!capabilities.workspace.configuration;
	hasWorkspaceFolderCapability =
		capabilities.workspace && !!capabilities.workspace.workspaceFolders;
	// hasDiagnosticRelatedInformationCapability =
	// 	capabilities.textDocument &&
	// 	capabilities.textDocument.publishDiagnostics &&
	// 	capabilities.textDocument.publishDiagnostics.relatedInformation;

	return {
		capabilities: {
			textDocumentSync: documents.syncKind,
			// Tell the client that the server supports code completion
			completionProvider: {
				resolveProvider: true
			}
		}
	};
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(
			DidChangeConfigurationNotification.type,
			undefined
		);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});


// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	validateXmlDocument(change.document);
});

async function validateXmlDocument(textDocument: TextDocument): Promise<void> {
	// In this simple example we get the settings for every validate run.
	//let settings = await getDocumentSettings(textDocument.uri);

	let validationData: XsdValidateResponse;
	try {
		let xsdDllPath = path.join(__dirname, '../XsdValidate/XsdValidate.dll');
		let stdin = textDocument.getText();
		let output = '';
		let docUrl = path.normalize(textDocument.uri).replace('file:', '');
		if (path.win32 && docUrl.indexOf('%3A') > 0)
			docUrl = docUrl.substring(1).replace("%3A", ":");

		if (path.extname(docUrl) === '.xsd')
			return;
		let opts: SpawnOptions = { cwd: path.dirname(docUrl) };
		let spawnResult = await spawnAsync(`dotnet exec ${xsdDllPath} ${textDocument.uri}`, stdin, opts);
		validationData = <XsdValidateResponse>JSON.parse(spawnResult.stdout);
	} catch (error) {
		console.error(error.message || error);
		return;
	}
	let lines = textDocument.getText().split('\n');

	let diagnostics: Diagnostic[] = [];
	for (let error of validationData.Errors) {
		let start = Position.create(error.LineNumber - 1, error.LinePosition - 1);
		let end = Position.create(error.LineNumber, 0);
		let element = '';
		if (error.Message.startsWith('Could not find schema information for the element')) {
			let line = lines[error.LineNumber - 1];
			let iEnd = line.indexOf(' ', error.LinePosition);
			if (iEnd > error.LinePosition) {
				end = Position.create(error.LineNumber - 1, iEnd);
			}
		} else {
			// figure out if there is a named element to highlight
			let iStart = error.Message.indexOf('\'');
			if (iStart > 0) {
				let iEnd = error.Message.indexOf('\'', iStart + 1);
				if (iEnd > 0) {
					element = error.Message.substring(iStart + 1, iEnd);
					end = Position.create(error.LineNumber - 1, error.LinePosition + element.length - 1);
				}
			}
		}

		let diagnosic: Diagnostic = {
			severity: (error.Severity == "Error") ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
			range: {
				start: start, end: end
			},
			message: error.Message,
			source: 'xsd'
		};
		diagnostics.push(diagnosic);
	}

	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		// The pass parameter contains the position of the text document in
		// which code complete got requested. For the example we ignore this
		// info and always provide the same completion items.
		return [
			{
				label: 'TypeScript',
				kind: CompletionItemKind.Text,
				data: 1
			},
			{
				label: 'JavaScript',
				kind: CompletionItemKind.Text,
				data: 2
			}
		];
	}
);

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		if (item.data === 1) {
			(item.detail = 'TypeScript details'),
				(item.documentation = 'TypeScript documentation');
		} else if (item.data === 2) {
			(item.detail = 'JavaScript details'),
				(item.documentation = 'JavaScript documentation');
		}
		return item;
	}
);

/*
connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.text the initial full content of the document.
	connection.console.log(`${params.textDocument.uri} opened.`);
});
connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.
	connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});
connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.uri uniquely identifies the document.
	connection.console.log(`${params.textDocument.uri} closed.`);
});
*/

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
