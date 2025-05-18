export function isModelReference(line: string): boolean {
    // Check for model relations and references
    const modelPatterns = [
      /belongs_to\s+:(\w+)/,
      /has_many\s+:(\w+)/,
      /has_one\s+:(\w+)/,
      /has_and_belongs_to_many\s+:(\w+)/,
      /class_name\s*[=:]\s*['"](\w+)['"]/,
      /\b([A-Z]\w+)\.find/,
      /\b([A-Z]\w+)\.where/,
      /\b([A-Z]\w+)\.create/,
      /\b([A-Z]\w+)\.new/,
    ];

    return modelPatterns.some((pattern) => pattern.test(line));
  }

export function isControllerReference(line: string): boolean {
    // Check for controller references
    return (
      /\b(\w+)Controller\b/.test(line) ||
      /controller\s*:\s*['"](\w+)['"]/.test(line)
    );
  }

export function isHelperReference(line: string): boolean {
    // Check for helper references
    return (
      /helper\s*:?\s*(\w+)/.test(line) ||
      /\b(\w+)Helper\b/.test(line) ||
      /\b(\w+::)+(\w+)Helper\b/.test(line)
    );
  }

export function isMailerReference(line: string): boolean {
    // Check for mailer references
    return (
      /mailer\s*:?\s*(\w+)/.test(line) ||
      /\b(\w+)Mailer\b/.test(line) ||
      /\b(\w+::)+(\w+)Mailer\b/.test(line)
    );
  }

export function isServiceReference(line: string): boolean {
    // Check for service object references
    return /\b(\w+)Service\b/.test(line) || /service\s*:?\s*(\w+)/.test(line);
  }

export function isViewReference(line: string): boolean {
    // Check for view references
    return (
      /render\s+['"](\w+)/.test(line) ||
      /render\s+:(\w+)/.test(line) ||
      /render\s+partial\s*:\s*['"](\w+)/.test(line)
    );
  }

export function isActiveRecordCallback(line: string): boolean {
    // Check for ActiveRecord callbacks
    const callbackPatterns = [
      /before_validation\s+:(\w+)/,
      /after_validation\s+:(\w+)/,
      /before_save\s+:(\w+)/,
      /after_save\s+:(\w+)/,
      /before_create\s+:(\w+)/,
      /after_create\s+:(\w+)/,
      /before_update\s+:(\w+)/,
      /after_update\s+:(\w+)/,
      /before_destroy\s+:(\w+)/,
      /after_destroy\s+:(\w+)/,
    ];

    return callbackPatterns.some((pattern) => pattern.test(line));
  }