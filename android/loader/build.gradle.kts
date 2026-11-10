plugins {
    id("com.android.application") version "8.13.2"
}

val sharedBundle = rootProject.layout.projectDirectory.file("../dist/moggcord-mobile.js")
val payloadAssets = layout.buildDirectory.dir("generated/moggcord/assets")
val prepareMoggcordPayload by tasks.registering(Copy::class) {
    from(sharedBundle)
    into(payloadAssets)
}

android {
    namespace = "cc.moggcord.mobile.loader"
    compileSdk = 36

    defaultConfig {
        applicationId = "cc.moggcord.mobile.loader"
        minSdk = 28
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    sourceSets["main"].assets.srcDir(payloadAssets)
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

tasks.named("preBuild") {
    dependsOn(prepareMoggcordPayload)
    doFirst {
        check(sharedBundle.asFile.isFile) { "Run npm run build at the root of Moggcord Mobile first." }
    }
}

dependencies {
    compileOnly("de.robv.android.xposed:api:82")
    implementation("org.luckypray:dexkit:2.3.0")
}
