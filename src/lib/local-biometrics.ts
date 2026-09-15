export async function isLocalBiometricsSupported() {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function bufferToBase64url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const charCode of bytes) {
    str += String.fromCharCode(charCode);
  }
  const base64String = btoa(str);
  return base64String.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlToBuffer(base64url: string) {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

const RP_NAME = "Titbeat SchoolPro";

export async function registerLocalBiometric(staffId: string, staffName: string): Promise<boolean> {
  if (!await isLocalBiometricsSupported()) throw new Error("Biometrics not supported on this device.");
  
  const challenge = window.crypto.getRandomValues(new Uint8Array(32));
  const userId = window.crypto.getRandomValues(new Uint8Array(16));
  
  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { 
          name: RP_NAME,
          id: window.location.hostname
        },
        user: {
          id: userId,
          name: staffId,
          displayName: staffName,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 } // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required"
        },
        timeout: 60000
      }
    }) as PublicKeyCredential;

    if (!credential) return false;

    // Save the credential ID locally against the staff ID
    const credIdStr = bufferToBase64url(credential.rawId);
    localStorage.setItem(`biometric_cred_${staffId.toLowerCase()}`, credIdStr);
    return true;
  } catch (err: any) {
    console.error("Biometric registration failed:", err);
    throw new Error(err.message || "Failed to register biometrics.");
  }
}

export function hasLocalBiometric(staffId: string): boolean {
  if (!staffId) return false;
  return !!localStorage.getItem(`biometric_cred_${staffId.toLowerCase()}`);
}

export async function verifyLocalBiometric(staffId: string): Promise<boolean> {
  const credIdStr = localStorage.getItem(`biometric_cred_${staffId.toLowerCase()}`);
  if (!credIdStr) throw new Error("No biometric credential found for this user.");
  
  const challenge = window.crypto.getRandomValues(new Uint8Array(32));
  const credentialId = base64urlToBuffer(credIdStr);

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials: [{
          type: "public-key",
          id: credentialId
        }],
        userVerification: "required",
        timeout: 60000
      }
    });

    if (assertion) return true;
    return false;
  } catch (err: any) {
    console.error("Biometric verification failed:", err);
    throw new Error(err.message || "Biometric verification failed.");
  }
}
