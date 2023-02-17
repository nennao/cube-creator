#version 300 es

uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjectionMatrix;

uniform mat3 u_EnvRotation;


in vec3 a_position;
out vec3 v_TexCoords;


void main()
{
    v_TexCoords = u_EnvRotation * a_position;

    mat4 mat = u_ProjectionMatrix * u_ViewMatrix;
    mat[3] = vec4(0.0, 0.0, 0.0, 0.1);
    vec4 pos = mat * vec4(a_position, 1.0);
    gl_Position = pos.xyww;
}
