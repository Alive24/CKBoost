/**
 * Enhanced error handling for SSRI server issues
 * Provides detailed error messages with context and recovery suggestions
 */

export interface SSRIErrorDetails {
  operation: string;
  context?: Record<string, unknown>;
  originalError: Error | unknown;
}

/**
 * Format SSRI errors with detailed context
 */
export function formatSSRIError(details: SSRIErrorDetails): string {
  const { operation, context, originalError } = details;
  
  // Extract error message
  const errorMessage = originalError instanceof Error 
    ? originalError.message 
    : String(originalError);
  
  // Check for common SSRI server issues
  if (errorMessage.includes('SSRI') || errorMessage.includes('server')) {
    return `SSRI server error during ${operation}. ` +
      `The SSRI server may be unavailable or experiencing issues. ` +
      `Please ensure the SSRI server is running and accessible. ` +
      `Error details: ${errorMessage}`;
  }
  
  // Check for network issues
  if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
    return `Network error during ${operation}. ` +
      `Please check your internet connection and try again. ` +
      `If the issue persists, the SSRI server may be unreachable. ` +
      `Error details: ${errorMessage}`;
  }
  
  // Check for transaction building errors
  if (errorMessage.includes('transaction') || errorMessage.includes('Transaction')) {
    return `Transaction building failed during ${operation}. ` +
      `This may be due to invalid data or insufficient balance. ` +
      `Please verify your inputs and wallet balance. ` +
      `Error details: ${errorMessage}`;
  }
  
  // Check for cell not found errors
  if (errorMessage.includes('not found') || errorMessage.includes('Cell')) {
    return `Required cell not found during ${operation}. ` +
      `The requested data may not exist on the blockchain yet. ` +
      `Please ensure all required contracts are deployed and data is initialized. ` +
      `Error details: ${errorMessage}`;
  }
  
  // Check for validation errors
  if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
    return `Validation error during ${operation}. ` +
      `The provided data does not meet the required format or constraints. ` +
      `Please check your input data and try again. ` +
      `Error details: ${errorMessage}`;
  }
  
  // Add context if available
  let contextStr = '';
  if (context && Object.keys(context).length > 0) {
    contextStr = ` Context: ${JSON.stringify(context, null, 2)}`;
  }
  
  // Default error format with all available information
  return `Error during ${operation}. ${errorMessage}${contextStr}`;
}

/**
 * Determine if an error is retryable
 */
export function isRetryableError(error: Error | unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Network and server errors are typically retryable
  if (
    errorMessage.includes('fetch') ||
    errorMessage.includes('network') ||
    errorMessage.includes('SSRI server') ||
    errorMessage.includes('timeout')
  ) {
    return true;
  }
  
  // Validation and data format errors are not retryable
  if (
    errorMessage.includes('validation') ||
    errorMessage.includes('invalid') ||
    errorMessage.includes('format')
  ) {
    return false;
  }
  
  // Default to not retryable for unknown errors
  return false;
}

/**
 * Get recovery suggestions based on error type
 */
export function getRecoverySuggestions(error: Error | unknown): string[] {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const suggestions: string[] = [];
  
  if (errorMessage.includes('SSRI') || errorMessage.includes('server')) {
    suggestions.push('Check if SSRI server is running');
    suggestions.push('Verify SSRI server URL configuration');
    suggestions.push('Try refreshing the page');
  }
  
  if (errorMessage.includes('network')) {
    suggestions.push('Check your internet connection');
    suggestions.push('Try again in a few moments');
    suggestions.push('Check browser console for detailed errors');
  }
  
  if (errorMessage.includes('balance') || errorMessage.includes('insufficient')) {
    suggestions.push('Check your wallet balance');
    suggestions.push('Ensure you have enough CKB for transaction fees');
    suggestions.push('Verify UDT token balance if funding campaigns');
  }
  
  if (errorMessage.includes('not found')) {
    suggestions.push('Ensure all contracts are deployed');
    suggestions.push('Verify the protocol is initialized');
    suggestions.push('Check that campaign/user data exists');
  }
  
  if (suggestions.length === 0) {
    suggestions.push('Check browser console for detailed error information');
    suggestions.push('Try refreshing the page');
    suggestions.push('Contact support if the issue persists');
  }
  
  return suggestions;
}