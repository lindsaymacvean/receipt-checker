function inferCurrency(analyzeResult) {
    const textContent = analyzeResult.content || '';
    if (textContent.includes('EUR')) return 'EUR';
    if (textContent.includes('GBP')) return 'GBP';
    if (textContent.includes('USD') || textContent.includes('$')) return 'USD';

    // fallback to TaxDetails
    const firstTax = analyzeResult.documents?.[0]?.fields?.TaxDetails?.valueArray?.[0];
    if (firstTax?.valueObject?.Amount?.valueCurrency?.currencyCode) {
        return firstTax.valueObject.Amount.valueCurrency.currencyCode;
    }
    return 'UNKNOWN';
}
  
function isValidReceipt(analyzeResult) {
    const doc = analyzeResult.documents?.[0];
    return doc?.docType?.startsWith('receipt') && doc?.confidence >= 0.85;
}

module.exports = { inferCurrency, isValidReceipt };