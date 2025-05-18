import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";


// Helper method to recursively find files in a directory
export async function findFilesInDir(dir: string, pattern: RegExp): Promise<string[]> {
    const result: string[] = [];

    try {
        const files = fs.readdirSync(dir);

        for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            const subResults = await findFilesInDir(filePath, pattern);
            result.push(...subResults);
        } else if (pattern.test(file)) {
            result.push(filePath);
        }
        }
    } catch (error) {
        console.error("Error searching for files:", error);
    }

    return result;
}


// Helper method to find a module/class definition in a file
export async function findHelperInFile(
    filePath: string,
    fullHelperName: string,
    namespace: string,
    helperName: string
  ): Promise<vscode.Location | null> {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const fileUri = vscode.Uri.file(filePath);

      // Look for different patterns that might define our helper

      // 1. Full class/module definition with namespace
      if (namespace) {
        // Look for "module Namespace; module/class HelperName" pattern
        const fullPattern = new RegExp(
          `(module|class)\\s+${namespace.replace(
            /::/g,
            "::+"
          )}(::)?\\s*${helperName}\\b`
        );

        const match = fullPattern.exec(content);
        if (match) {
          const document = await vscode.workspace.openTextDocument(fileUri);
          const lineIndex = findLineNumberForPosition(
            content,
            match.index
          );
          return new vscode.Location(
            fileUri,
            new vscode.Position(lineIndex, match.index)
          );
        }
      }

      // 2. Simple class/module definition (without full namespace)
      const simplePattern = new RegExp(`(module|class)\\s+${helperName}\\b`);
      const simpleMatch = simplePattern.exec(content);
      if (simpleMatch) {
        const document = await vscode.workspace.openTextDocument(fileUri);
        const lineIndex = findLineNumberForPosition(
          content,
          simpleMatch.index
        );
        return new vscode.Location(
          fileUri,
          new vscode.Position(lineIndex, simpleMatch.index)
        );
      }

      // 3. Check if file contains the namespace modules and helper separately
      if (
        namespace &&
        content.includes(`module ${namespace}`) &&
        (content.includes(`module ${helperName}`) ||
          content.includes(`class ${helperName}`))
      ) {
        return new vscode.Location(fileUri, new vscode.Position(0, 0));
      }
    } catch (error) {
      console.error(`Error analyzing file ${filePath}: ${error}`);
    }

    return null;
}


// Helper method to find the line number for a specific position in text
export function findLineNumberForPosition(text: string, position: number): number {
    const textBeforePosition = text.substring(0, position);
    return (textBeforePosition.match(/\n/g) || []).length;
}


// Helper to convert plural to singular for Rails conventions
export function singularize(word: string): string {
    // Very basic implementation - won't handle all cases
    if (word.endsWith("ies")) {
      return word.slice(0, -3) + "y";
    } else if (word.endsWith("s")) {
      return word.slice(0, -1);
    }
    return word;
}


// Helper to convert to class name format
export function classify(word: string): string {
    return word
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
}