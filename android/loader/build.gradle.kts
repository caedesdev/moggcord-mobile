import groovy.json.JsonSlurper
import java.net.URI
import java.security.MessageDigest
import java.util.zip.ZipFile

plugins {
    id("com.android.application") version "8.13.2"
}

val sharedBundle = rootProject.layout.projectDirectory.file("../dist/moggcord-mobile.js")
val mobilePackage = JsonSlurper().parse(rootProject.file("../package.json")) as Map<*, *>
val mobileVersion = mobilePackage["version"] as String
val launcherVersion = "$mobileVersion-s24.2"
val (major, minor, patch) = mobileVersion.split(".").map(String::toInt)
val payloadAssets = layout.buildDirectory.dir("generated/moggcord/assets")
val prepareMoggcordPayload by tasks.registering(Copy::class) {
    from(sharedBundle)
    into(payloadAssets)
}

val patcherVersion = "1.2-492"
val patcherSha256 = "576e6ef5a9023b0ab585ef1427a10fd12c15dbb89e1483a6234e821d9163cb41"
val patcherLibrary = layout.buildDirectory.file("generated/patcher/lspatch.jar")
val patcherAssets = layout.buildDirectory.dir("generated/patcher/assets")
val prepareAndroidPatcher by tasks.registering {
    inputs.property("sha256", patcherSha256)
    outputs.file(patcherLibrary)
    outputs.dir(patcherAssets)

    doLast {
        val archive = temporaryDir.resolve("lspatch.jar")
        val connection = URI(
            "https://github.com/JingMatrix/LSPatch/releases/download/canary-492/lspatch-v$patcherVersion-release.jar"
        ).toURL().openConnection()
        connection.connectTimeout = 20_000
        connection.readTimeout = 30_000
        connection.getInputStream().use { input ->
            archive.outputStream().use { output -> input.copyTo(output) }
        }
        val digest = MessageDigest.getInstance("SHA-256").digest(archive.readBytes())
            .joinToString("") { "%02x".format(it) }
        check(digest == patcherSha256) { "Android patcher checksum mismatch." }

        ZipFile(archive).use { zip ->
            val nativeLibraries = listOf("armeabi-v7a", "arm64-v8a", "x86", "x86_64")
                .map { "so/$it/liblspatch.so" }
            // Stage the patcher payload explicitly so its resource paths stay consistent in the APK.
            for (payload in listOf("loader.dex", "metaloader.dex") + nativeLibraries) {
                val path = "lspatch/$payload"
                val entry = requireNotNull(zip.getEntry("assets/$path"))
                val asset = patcherAssets.get().file(path).asFile
                asset.parentFile.mkdirs()
                zip.getInputStream(entry).use { input ->
                    asset.outputStream().use { output -> input.copyTo(output) }
                }
            }
        }
        archive.copyTo(patcherLibrary.get().asFile, overwrite = true)
    }
}

android {
    namespace = "cc.moggcord.mobile.loader"
    compileSdk = 36

    defaultConfig {
        applicationId = "cc.moggcord.mobile.launcher"
        minSdk = 28
        targetSdk = 36
        versionCode = major * 1_000_000 + minor * 1_000 + patch
        versionName = launcherVersion
        resValue("string", "launcher_build_label", "Galaxy S24 test · $launcherVersion")
    }
    buildTypes {
        getByName("debug") {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-dev"
        }
    }

    sourceSets["main"].assets.srcDir(payloadAssets)
    sourceSets["main"].assets.srcDir(patcherAssets)
    packaging.resources.excludes += setOf("assets/lspatch/**", "assets/keystore", "assets/new_keystore")
    packaging.resources.pickFirsts += setOf("META-INF/DEPENDENCIES", "META-INF/LICENSE*", "META-INF/NOTICE*")
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

tasks.named("preBuild") {
    dependsOn(prepareMoggcordPayload, prepareAndroidPatcher)
    doFirst {
        check(sharedBundle.asFile.isFile) { "Run npm run build at the root of Moggcord Mobile first." }
    }
}

dependencies {
    compileOnly("de.robv.android.xposed:api:82")
    implementation("org.luckypray:dexkit:2.3.0")
    implementation(files(patcherLibrary).builtBy(prepareAndroidPatcher))
}
