#version 300 es

uniform mat4 u_RubikMatrix;
uniform mat4 u_ModelMatrix;
uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjectionMatrix;

in vec4 a_VertexPosition;
in vec3 a_VertexColor;
in vec3 a_VertexNormal;

out vec3 v_Color;
out vec3 v_Normal;


void main() {
    gl_Position = u_ProjectionMatrix * u_ViewMatrix *  u_RubikMatrix * u_ModelMatrix * a_VertexPosition;

    v_Color = a_VertexColor;
    v_Normal = normalize(mat3(u_RubikMatrix * u_ModelMatrix) * a_VertexNormal);
}
