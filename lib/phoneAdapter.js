'use strict';

goog.require('i18n.phonenumbers.AsYouTypeFormatter');
goog.require('i18n.phonenumbers.PhoneNumberFormat');
goog.require('i18n.phonenumbers.PhoneNumberUtil');
goog.require('i18n.phonenumbers.PhoneNumberUtil.ValidationResult');

var phoneUtil = i18n.phonenumbers.PhoneNumberUtil.getInstance(),
    PNF = i18n.phonenumbers.PhoneNumberFormat,
    PNT = i18n.phonenumbers.PhoneNumberType,
    PNVR = i18n.phonenumbers.PhoneNumberUtil.ValidationResult,
    allRegionCodes; // region codes from metadata

// map style strings to PhoneNumberFormat codes
var stylesMap = {
    'e164': PNF.E164,
    'international': PNF.INTERNATIONAL,
    'national': PNF.NATIONAL,
    'rfc3966': PNF.RFC3966
},
    // returned from validatePhoneNumber (coded to a particular phoneHandler message)
    validationErrors = {
        INVALID_FOR_REGION: 'PHN_INVALID_FOR_REGION',
        INVALID_COUNTRY_CODE: 'PHN_INVALID_COUNTRY_CODE',
        TOO_LONG: 'PHN_NUMBER_TOO_LONG',
        TOO_SHORT: 'PHN_NUMBER_TOO_SHORT',
    },
    // thrown
    exceptions = {
        INVALID_STYLE: 'Invalid style property: ',
        METADATA_NOT_LOADED: 'No metadata loaded',
        UNSUPPORTED_REGION: 'Metadata not loaded for region: ', // thrown if function called with regionCode for which no metadata loaded
        PHONE_OBJ_INVALID: 'Phone object conversion failed: '
    },
    // some systems support these territories, but libphonenumber does not, so map to ones that libphonenumber supports
    // NOTE: quote the keys so google closure compiler won't reduce them
    legacyRegionCodeMap = {
        'AN': 'BQ', // Netherlands Antilles no longer exists, so use Bonaire, Sint Eustatius and Saba instead
        'PN': 'NZ', // Pitcairn Islands - use NZ data
        'XK': 'MC'  // for Kosovo, use Monaco metadata
    },
    // map number type strings to PhoneNumberType codes
    numberTypeMap = {
        'FIXED_LINE': PNT.FIXED_LINE,
        'MOBILE': PNT.MOBILE,
        'FIXED_LINE_OR_MOBILE': PNT.FIXED_LINE_OR_MOBILE,
        'TOLL_FREE': PNT.TOLL_FREE,
        'PREMIUM_RATE': PNT.PREMIUM_RATE,
        'SHARED_COST': PNT.SHARED_COST,
        'VOIP': PNT.VOIP,
        'PERSONAL_NUMBER': PNT.PERSONAL_NUMBER,
        'PAGER': PNT.PAGER,
        'UAN': PNT.UAN,
        'VOICEMAIL': PNT.VOICEMAIL
    };

/**
 * @param {string} regionCode territory code
 * Return a simple AsYouTypeFormatter object initialized to the given territory
 */
function getAsYouTypeFormatter(regionCode) {
    checkMetadataLoaded();

    regionCode = legacyRegionCodeMap[regionCode] || regionCode;
    checkSupportedRegion(regionCode);

    // instantiate formatter
    var formatter = new i18n.phonenumbers.AsYouTypeFormatter(regionCode);

    return {
        'inputDigit': function inputDigit(x) {
            return formatter.inputDigit(x);
        },
        'clear': function clear() {
            return formatter.clear();
        }
    };
}

/**
 * initialization function that calls injectMeta (provided by metadataInjector)
 * sets allRegionCodes
 * initializes formatter to first country (necessary to prevent Closure Compiler from removing the code)
 * @param {Object} bundle metadata object with regionCodes, countryCodeToRegionCodeMap, and countryToMetadata properties
 */
function useMeta(bundle) {
    // console.log('useMeta called for', bundle['regionCodes']);
    allRegionCodes = bundle['regionCodes']; // quote property names to prevent closure compiler from reducing them
    injectMeta(bundle['countryCodeToRegionCodeMap'], bundle['countryToMetadata']);
}

/**
 * Original functions from libphonenumber-hammond
 */

/**
 * @return {Object|undefined} map from country calling codes to arrays of regions
 */
function countryCodeToRegionCodeMap() {
    checkMetadataLoaded();
    return i18n.phonenumbers.metadata.countryCodeToRegionCodeMap;
}

/**
 * @param {string} regionCode territory code
 * @return {string|undefined} country calling code for that territory
 * @throws {Error} if metadata has not been loaded for that region
 */
function getCountryCodeForRegion(regionCode) {
    checkMetadataLoaded();

    regionCode = legacyRegionCodeMap[regionCode] || regionCode;
    checkSupportedRegion(regionCode); // throws if region not supported

    return phoneUtil.getCountryCodeForRegion(regionCode);
}

/**
 * @return {Array|undefined} array of supported regions
 */
function getSupportedRegions() {
    checkMetadataLoaded();

    return phoneUtil.getSupportedRegions();
}


/**
 *  PHONE ADAPTER FUNCTIONS
 */


/**
 * @param {Object} phoneObj
 * @param {Object} options - style : 'national', 'international', 'E164' or 'RFC3699'
 * @return {string} formatted phone number if valid
 * @throws {Error} if style is invalid, or input is undefined/NaN
 */
function formatPhoneNumber(phoneObj, options) {
    checkMetadataLoaded();

    var phoneNumber;
    try {
        phoneNumber = phoneObjToProto(phoneObj); // convert phoneObj to protocol buffer format
    } catch (e) {
        throw new Error(exceptions.PHONE_OBJ_INVALID + e.message);
    }

    options = options || {};

    // map style string (e.g. 'national') to PhoneNumberFormat code
    var formatType = stylesMap[options.style];
    if (formatType === undefined) {
        throw new Error(exceptions.INVALID_STYLE + options.style);
    }

    return phoneUtil.format(phoneNumber, formatType).toString();
}

/**
 * @param {Object} phoneObj
 * @param {string} regionCode i.e. 'US'
 * @return {boolean|Error} true if phone number is valid, Error with details if phone number is not valid
 * @throws {Error} if metadata has not been loaded for given region or phoneObj to proto conversion failed
 */
function validatePhoneNumber(phoneObj, regionCode) {
    checkMetadataLoaded();

    regionCode = legacyRegionCodeMap[regionCode] || regionCode;
    checkSupportedRegion(regionCode);

    var phoneNumber;
    try {
        phoneNumber = phoneObjToProto(phoneObj); // convert phoneObj to protocol buffer format
    } catch (e) {
        throw new Error(exceptions.PHONE_OBJ_INVALID + e.message);
    }

    // if number is valid for the region, simply return true
    if (phoneUtil.isValidNumberForRegion(phoneNumber, regionCode)) {
        return true;
    }

    // if number was not valid, attempt to get the reason
    var validFlag = phoneUtil.isPossibleNumberWithReason(phoneNumber),
        errorCode;

    // select Error to return based on validFlag code
    switch (validFlag) {
        case PNVR.INVALID_COUNTRY_CODE:
            errorCode = validationErrors.INVALID_COUNTRY_CODE;
            break;
        case PNVR.TOO_SHORT:
            errorCode = validationErrors.TOO_SHORT;
            break;
        case PNVR.TOO_LONG:
            errorCode = validationErrors.TOO_LONG;
            break;
        default: // note that isPossibleNumberWithReason can be more lenient than isValidNumberForRegion, so we need a generic default
            errorCode = validationErrors.INVALID_FOR_REGION;
    }

    // return the error as Error object
    return new Error(errorCode);
}

/**
 * @param {string} phoneNumberToParse
 * @param {string} regionCode ie 'US'
 * @return {Object} phoneObj
 *         {Error} if number is invalid
 */
function parsePhoneNumber(phoneNumberToParse, regionCode) {
    checkMetadataLoaded();

    regionCode = legacyRegionCodeMap[regionCode] || regionCode;
    checkSupportedRegion(regionCode);

    var parsedPhoneNumber;
    try {
        parsedPhoneNumber = phoneUtil.parse(phoneNumberToParse, regionCode);
    } catch (e) {
        return new Error(e); // libphonenumber throws strings, so wrap message in Error object to be returned
    }
    return protoToPhoneObj(parsedPhoneNumber);
}

/**
 * @param {string} regionCode
 * @param {string} type
 * @return {Object} phoneObj
 */
function getExampleNumberForType(regionCode, type) {
    checkMetadataLoaded();

    regionCode = legacyRegionCodeMap[regionCode] || regionCode;
    checkSupportedRegion(regionCode);

    // convert type string (e.g. 'FIXED_LINE') to PhoneNumberType code
    var numberType = numberTypeMap[type];

    if (numberType === undefined) {
        numberType = PNT.UNKNOWN;
    }

    return protoToPhoneObj(phoneUtil.getExampleNumberForType(regionCode, numberType));
}


/**
 * HELPER FUNCTIONS
 */

/**
 * @return {undefined} if metadata is loaded
 * @throws {Error} if no metadata loaded
 * @private
 */
function checkMetadataLoaded() {
    if (!allRegionCodes || !allRegionCodes.length) {
        throw new Error(exceptions.METADATA_NOT_LOADED);
    }
}

/**
 * @param {string} regionCode regionCode string to check
 * @return {undefined} if regionCode is supported
 * @throws {Error} if regionCode is not supported
 * @private
 */
function checkSupportedRegion(regionCode) {
    if (allRegionCodes.indexOf(regionCode) === -1) {
        throw new Error(exceptions.UNSUPPORTED_REGION + regionCode);
    }
}

/**
 * @param {Object} phoneNumber phone number in protocol buffer format
 * @return {Object} phone object
 * @private
 */
function protoToPhoneObj(phoneNumber) {

    if (phoneNumber === null) {
        return null;
    }

    var phoneObj = {
        'countryCode': phoneNumber.values_[1].toString(),
        'nationalNumber': phoneNumber.values_[2].toString()
    };

    if (phoneNumber.values_[4] && phoneUtil.isLeadingZeroPossible(phoneNumber.values_[1])) {
        phoneObj['nationalNumber'] = '0' + phoneObj['nationalNumber'];
    }

    if (phoneNumber.values_[3] !== undefined) {
        phoneObj['extension'] = phoneNumber.values_[3]; // quote property names to prevent closure compiler reduction
    }
    return phoneObj;
}

/**
 * @param {Object} phoneObj, where countryCode and nationalNumber are required
 * @return {i18n.phonenumbers.PhoneNumber} phoneNumber in protocol buffer format
 * @private
 *
 * Note: assumes phoneObj is already in correct format:
 *      countryCode: integer or string of integer
 *      nationalNumber: integer or string of integer
 *      extension: string or number
 *
 * For phoneNumber protocol buffer methods, countryCode and nationalNumber are converted to number, and extension is converted to string
 */
function phoneObjToProto(phoneObj) {
    var phoneNumber = new i18n.phonenumbers.PhoneNumber();

    var countryCode, nationalNumber, extension;

    // note: use string literals when referencing object properties to prevent closure compiler from reducing

    // deal with countryCode
    countryCode = Number(phoneObj['countryCode']); // convert to number
    phoneNumber.setCountryCode(countryCode);

    // deal with nationalNumber
    nationalNumber = phoneObj['nationalNumber'];
    if (typeof nationalNumber === 'string') { // special handling for nationalNumber string type (could have leading 0)

        // setItalianLeadingZero = true if
        // nationalNumber is a string and starts with '0'
        // and leading zero is possible for that country
        phoneNumber.setItalianLeadingZero(nationalNumber.charAt(0) === '0' && phoneUtil.isLeadingZeroPossible(countryCode));

        nationalNumber = Number(nationalNumber); // now convert to number (removes leading 0 if it exists)
    }
    phoneNumber.setNationalNumber(nationalNumber);

    // deal with extension
    if (phoneObj['extension'] !== undefined && phoneObj['extension'] !== null) { // if extension exists

        extension = phoneObj['extension'].toString(); // convert to string

        phoneNumber.setExtension(extension);
    }

    return phoneNumber;
}


// original functions
goog.exportSymbol('countryCodeToRegionCodeMap', countryCodeToRegionCodeMap);
goog.exportSymbol('getCountryCodeForRegion', getCountryCodeForRegion);
goog.exportSymbol('getSupportedRegions', getSupportedRegions);

// phone adapter functions
goog.exportSymbol('formatPhoneNumber', formatPhoneNumber);
goog.exportSymbol('validatePhoneNumber', validatePhoneNumber);
goog.exportSymbol('parsePhoneNumber', parsePhoneNumber);
goog.exportSymbol('getExampleNumberForType', getExampleNumberForType);

// initialization function
goog.exportSymbol('useMeta', useMeta);

// AsYouTypeFormatter constructor
goog.exportSymbol('getAsYouTypeFormatter', getAsYouTypeFormatter);