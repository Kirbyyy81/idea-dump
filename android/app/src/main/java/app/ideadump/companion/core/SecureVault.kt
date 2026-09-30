package app.ideadump.companion.core

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Keystore keys never leave the device. Payloads use separate authenticated contexts. */
class SecureVault(context: Context) {
    private val preferences = context.getSharedPreferences("companion_secrets", Context.MODE_PRIVATE)
    @Synchronized private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("companion.aes.v1", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("companion.aes.v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).build())
        }.generateKey()
    }
    fun encrypt(value: String, context: String): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(context.toByteArray(Charsets.UTF_8))
        return cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
    }
    fun decrypt(value: ByteArray, context: String): String {
        require(value.size >= 28)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, value.copyOfRange(0, 12)))
        cipher.updateAAD(context.toByteArray(Charsets.UTF_8))
        return cipher.doFinal(value.copyOfRange(12, value.size)).toString(Charsets.UTF_8)
    }
    @Synchronized fun read(name: String): String? = preferences.getString(name, null)?.let {
        decrypt(Base64.decode(it, Base64.NO_WRAP), name)
    }
    @Synchronized fun write(name: String, value: String?) {
        val editor = preferences.edit()
        if (value == null) editor.remove(name)
        else editor.putString(name, Base64.encodeToString(encrypt(value, name), Base64.NO_WRAP))
        check(editor.commit()) { "Secure storage unavailable" }
    }
}
