// IBL


uniform int u_MipCount;
uniform samplerCube u_LambertianEnvSampler;
uniform samplerCube u_GGXEnvSampler;
uniform sampler2D u_GGXLUT;

uniform mat3 u_EnvRotation;

uniform sampler2D u_NormalSampler0;
uniform sampler2D u_NormalSampler1;
uniform sampler2D u_NormalSampler2;
uniform float u_NormalScale;
