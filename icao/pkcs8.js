/**
 *  ---------
 * |.##> <##.|  Open Smart Card Development Platform (www.openscdp.org)
 * |#       #|  
 * |#       #|  Copyright (c) 1999-2009 CardContact Software & System Consulting
 * |'##> <##'|  Andreas Schwier, 32429 Minden, Germany (www.cardcontact.de)
 *  --------- 
 *
 *  This file is part of OpenSCDP.
 *
 *  OpenSCDP is free software; you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License version 2 as
 *  published by the Free Software Foundation.
 *
 *  OpenSCDP is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with OpenSCDP; if not, write to the Free Software
 *  Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * @fileoverview Basic helper functions to convert PKCS#8 data to GP keys and vice versa
 */



/**
 * Empty constructor
 */
function PKCS8() {
	
}



/**
 * Convert x/y coordinates to uncompressed format
 *
 * x/y - coordinates of EC point
 * 
 * return ByteString containing compressed format
 *
 */ 
PKCS8.encodeUncompressedECPoint = function(x,y) {
   
   bb = new ByteBuffer();
   
   // uncompressed encoding
   bb.append(new ByteString("04", HEX));
   bb.append(new ByteString(x, HEX));
   bb.append(new ByteString(y, HEX));
   
   return bb.toByteString();
}



/**
 * Convert uncompressed format to x and y coordinates
 *
 * x/y - coordinates of EC point
 * 
 * return ByteString containing compressed format
 *
 */ 
PKCS8.decodeUncompressedECPoint = function(uncompressedPoint) {
    
    // Determine the size of the coordinates ignoring the indicator byte '04'
    var length = uncompressedPoint.length - 1;
    
    var sizeOfCoordinate = length / 2;
    
    var xValue = uncompressedPoint.bytes(1, sizeOfCoordinate);
    var yValue = uncompressedPoint.bytes(1 + sizeOfCoordinate, sizeOfCoordinate);
    
    return { x:xValue, y:yValue };
} 



/**
 * Strips leading zeros of a ByteString
 *
 * @param {ByteString} value the ByteString value
 * @return the stripped ByteString object, may be an empty ByteString
 * @type ByteString
 */
PKCS8.stripLeadingZeros = function(value) {
	var i = 0;
	for (; (i < value.length) && (value.byteAt(i) == 0); i++);
	
	return value.right(value.length - i);
}



/**
 * Encode a given GP private key as specified by the PKCS#8 format
 *
 * For now we only support the encoding of ECC private keys in a prime field
 *
 * @param {Key} the private key object that should be encoded
 * @return the encoded PKCS#8 private key
 * @type ByteString
 */
PKCS8.encodeKeyUsingPKCS8Format = function(privateKey) {
	
	assert(privateKey.getType() == Key.PRIVATE);
	
	var privateKeyInfo = new ASN1(ASN1.SEQUENCE);
	
	// Set the version number - must be zero
	privateKeyInfo.add(new ASN1(ASN1.INTEGER, new ByteString("00", HEX)));
	
	var privateKeyAlgorithm = new ASN1(ASN1.SEQUENCE);
	privateKeyAlgorithm.add(new ASN1(ASN1.OBJECT_IDENTIFIER, new ByteString("1.2.840.10045.2.1", OID)));
	
	var domainInfo = new ASN1(ASN1.SEQUENCE);
	
	// Cofactor - must be 1
	domainInfo.add(new ASN1(ASN1.INTEGER, PKCS8.stripLeadingZeros(privateKey.getComponent(Key.ECC_H))));
	
	var field = new ASN1(ASN1.SEQUENCE);
	
	// we are using a prime field
	field.add(new ASN1(ASN1.OBJECT_IDENTIFIER, new ByteString("1.2.840.10045.1.1", OID))); // prime field
	
	var primeOrder = privateKey.getComponent(Key.ECC_P);
	if (primeOrder.byteAt(0) >= 0x80) { // signed int? -> add 0x00
		field.add(new ASN1(ASN1.INTEGER, new ByteString("00", HEX).concat(privateKey.getComponent(Key.ECC_P))));
	} else {
		field.add(new ASN1(ASN1.INTEGER, privateKey.getComponent(Key.ECC_P)));
	}
	
	domainInfo.add(field);
	
	// Coefficients a and b
	var coeff = new ASN1(ASN1.SEQUENCE);
	
	// first coefficient
	coeff.add(new ASN1(ASN1.OCTET_STRING, privateKey.getComponent(Key.ECC_A)));
	
	// second coefficient
	coeff.add(new ASN1(ASN1.OCTET_STRING, privateKey.getComponent(Key.ECC_B)));
	
	domainInfo.add(coeff);
	
	// Base point (uncompressed)
	var gx = privateKey.getComponent(Key.ECC_GX);
	var gy = privateKey.getComponent(Key.ECC_GY);
	
	domainInfo.add(new ASN1(ASN1.OCTET_STRING, PKCS8.encodeUncompressedECPoint(gx, gy)));
	
	// group order generated by the base point
	var groupOrder = privateKey.getComponent(Key.ECC_N);
	if (groupOrder.byteAt(0) >= 0x80) { // signed int? -> add 0x00
		domainInfo.add(new ASN1(ASN1.INTEGER, new ByteString("00", HEX).concat(privateKey.getComponent(Key.ECC_N))));
	} else {
		domainInfo.add(new ASN1(ASN1.INTEGER, privateKey.getComponent(Key.ECC_N)));
	}
	
	privateKeyAlgorithm.add(domainInfo);
	
	// encode the key information
	privateKeyInfo.add(privateKeyAlgorithm);
	
	// encode the private key
	var encodedPrivateKey = new ASN1(ASN1.OCTET_STRING);
	
	var pk = privateKey.getComponent(Key.ECC_D);	
	var key = new ASN1(ASN1.SEQUENCE);
	key.add(new ASN1(ASN1.INTEGER, new ByteString("01", HEX)));
	key.add(new ASN1(ASN1.OCTET_STRING, pk));
	
	encodedPrivateKey.add(key);
	
	privateKeyInfo.add(encodedPrivateKey);
	
	return privateKeyInfo.getBytes();	
}



/**
 * Decode a given PKCS#8 private key from the given ByteString and create a GP key object
 *
 * For now we only support the decoding of ECC private keys in a prime field
 * 
 * @param {ByteString} the private key object in PKCS#8 format
 * @return the GP key object
 * @type Key
 */
PKCS8.decodeKeyFromPKCS8Format = function(encodedKey) {
	
	var key = new Key();
	
	key.setType(Key.PRIVATE);
	
	var p8 = new ASN1(encodedKey);
	
	var privKeyBlock = p8.get(2);
	
	// Get the raw private key value
	var encodedKey = new ASN1(privKeyBlock.value);
	key.setComponent(Key.ECC_D, encodedKey.get(1).value);
	
	// Decode the domain parameters
	var domainParameter = p8.get(1).get(1);
	
	var cofactor = domainParameter.get(0);
	key.setComponent(Key.ECC_H, cofactor.value);
	
	var order = domainParameter.get(1).get(1);
	key.setComponent(Key.ECC_P, order.value);
	
	var coeff_A = domainParameter.get(2).get(0);
	key.setComponent(Key.ECC_A, coeff_A.value);
	
	var coeff_B = domainParameter.get(2).get(1);
	key.setComponent(Key.ECC_B, coeff_B.value);
	
	var generatorPoint = domainParameter.get(3).value;
	
	var coordinates = PKCS8.decodeUncompressedECPoint(generatorPoint);
	
	key.setComponent(Key.ECC_GX, coordinates.x);
	key.setComponent(Key.ECC_GY, coordinates.y);
	
	var groupOrder = domainParameter.get(4);
	
	key.setComponent(Key.ECC_N, groupOrder.value);
	
	return key;	
}



/**
 * Simple self-test
 */
PKCS8.test = function() {

	// Set OID for EC curve
	var ecCurve = "1.3.36.3.3.2.8.1.1.7";
    
    var crypto = new Crypto("BC");
    
    // Create empty public key object
    var pubKey = new Key();
    pubKey.setType(Key.PUBLIC);
    pubKey.setComponent(Key.ECC_CURVE_OID, new ByteString(ecCurve, OID)); 

    // Create empty private key object
    var priKey = new Key();
    priKey.setType(Key.PRIVATE);
    priKey.setComponent(Key.ECC_CURVE_OID, new ByteString(ecCurve, OID)); 
    
    // Generate key pair
    crypto.generateKeyPair(Crypto.EC, pubKey, priKey);
	       
    // Encode
    var p8Key = PKCS8.encodeKeyUsingPKCS8Format(priKey);
    
    // Decode
    var decodedKeyObject = PKCS8.decodeKeyFromPKCS8Format(p8Key);
    
    // Compare
    assert(decodedKeyObject.getComponent(Key.ECC_D).equals(priKey.getComponent(Key.ECC_D)));
    
    assert(decodedKeyObject.getComponent(Key.ECC_GX).equals(priKey.getComponent(Key.ECC_GX)));
    assert(decodedKeyObject.getComponent(Key.ECC_GY).equals(priKey.getComponent(Key.ECC_GY)));
    assert(decodedKeyObject.getComponent(Key.ECC_A).equals(pubKey.getComponent(Key.ECC_A)));
    assert(decodedKeyObject.getComponent(Key.ECC_B).equals(pubKey.getComponent(Key.ECC_B)));
     
    // Encode
    var refp8Key = PKCS8.encodeKeyUsingPKCS8Format(decodedKeyObject);
	
    // Compare
    assert(p8Key.equals(refp8Key));	
}
