#version 300 es

uniform mat4 u_RubikMatrix;
uniform mat4 u_ModelMatrix;
uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjectionMatrix;

in vec4 a_VertexPosition;
in vec3 a_VertexColor;

out vec3 v_Color;


void main() {
    gl_Position = u_ProjectionMatrix * u_ViewMatrix *  u_RubikMatrix * u_ModelMatrix * a_VertexPosition;

    v_Color = a_VertexColor;
}
