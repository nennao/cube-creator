//uniform float u_EnvIntensity;


uniform int u_Axis;
uniform int u_Level;

uniform float u_BlockR;
uniform float u_Spread;
uniform float u_CurrAngle;

uniform int u_EnableBlocking;
uniform int u_EnableBlockingAO;

uniform vec3 u_BlockPosition;
uniform mat4 u_RubikMatrix;
uniform mat3 u_RubikMatrixInv;


float blockAO() {
    return sRGBToLinearF(blockOcclusion(
    u_RubikMatrixInv, v_Position, u_BlockPosition, u_BlockR, u_Spread, u_CurrAngle, u_Axis, u_Level
    ));
}

float blockIBL(vec3 rayDir, out vec3 outReflect) {
    return u_EnableBlocking == 1 ? blockIntersection(
    outReflect, mat3(u_RubikMatrix), u_RubikMatrixInv, v_Position, rayDir, u_BlockPosition, u_BlockR, u_Spread, u_CurrAngle, u_Axis, u_Level
    ) : -1.0;
}


vec3 getDiffuseLight(vec3 n)
{
    return colorLighting(desaturate(texture(u_LambertianEnvSampler, u_EnvRotation * n).rgb)) * u_EnvIntensity;
}


vec4 getSpecularSample(vec3 reflection, float lod)
{
    return colorLightingV4(desaturateV4(textureLod(u_GGXEnvSampler, u_EnvRotation * reflection, lod))) * u_EnvIntensity;
}

vec3 getIBLRadianceGGX(vec3 n, vec3 v, float roughness, vec3 F0, float specularWeight, float metallic)
{
    float NdotV = clampedDot(n, v);
    float lod = roughness * float(u_MipCount - 1);
    vec3 reflection = normalize(reflect(-v, n));

    vec3 outReflect = vec3(0);
    float t = blockIBL(reflection, outReflect);

    vec2 brdfSamplePoint = clamp(vec2(NdotV, roughness), vec2(0.0, 0.0), vec2(1.0, 1.0));
    vec2 f_ab = texture(u_GGXLUT, brdfSamplePoint).rg;
    vec4 specularSample = getSpecularSample(reflection, lod);


    if (t >= 0.0) {
//        float t2 = blockIBL(outReflect, outReflect); if (t2 >=0.0) blockIBL(outReflect, outReflect);

        vec4 specularSample2 = clamp(getSpecularSample(outReflect, lod) * (metallic*0.75+0.25), 0.0, metallic*0.5+0.25) * 0.75;

        specularSample = clamp(specularSample, 0.0, 0.75) * 0.75;
        specularSample2 = mix(specularSample, specularSample2, u_BlockR*0.5+0.5);

        specularSample = mix(specularSample2, specularSample, (clamp(roughness, 0.0, 0.5) * 2.0) * ((metallic*0.5 + 0.5) + (0.5 - metallic*0.5)));
    }

    vec3 specularLight = specularSample.rgb;

    // see https://bruop.github.io/ibl/#single_scattering_results at Single Scattering Results
    // Roughness dependent fresnel, from Fdez-Aguera
    vec3 Fr = max(vec3(1.0 - roughness), F0) - F0;
    vec3 k_S = F0 + Fr * pow(1.0 - NdotV, 5.0);
    vec3 FssEss = k_S * f_ab.x + f_ab.y;

    return specularWeight * specularLight * FssEss;
}


// specularWeight is introduced with KHR_materials_specular
vec3 getIBLRadianceLambertian(vec3 n, vec3 v, float roughness, vec3 diffuseColor, vec3 F0, float specularWeight)
{
    float NdotV = clampedDot(n, v);
    vec2 brdfSamplePoint = clamp(vec2(NdotV, roughness), vec2(0.0, 0.0), vec2(1.0, 1.0));
    vec2 f_ab = texture(u_GGXLUT, brdfSamplePoint).rg;

    vec3 irradiance = getDiffuseLight(n);

    // see https://bruop.github.io/ibl/#single_scattering_results at Single Scattering Results
    // Roughness dependent fresnel, from Fdez-Aguera

    vec3 Fr = max(vec3(1.0 - roughness), F0) - F0;
    vec3 k_S = F0 + Fr * pow(1.0 - NdotV, 5.0);
    vec3 FssEss = specularWeight * k_S * f_ab.x + f_ab.y; // <--- GGX / specular light contribution (scale it down if the specularWeight is low)

    // Multiple scattering, from Fdez-Aguera
    float Ems = (1.0 - (f_ab.x + f_ab.y));
    vec3 F_avg = specularWeight * (F0 + (1.0 - F0) / 21.0);
    vec3 FmsEms = Ems * FssEss * F_avg / (1.0 - F_avg * Ems);
    vec3 k_D = diffuseColor * (1.0 - FssEss + FmsEms); // we use +FmsEms as indicated by the formula in the blog post (might be a typo in the implementation)

    return (FmsEms + k_D) * irradiance;
}
