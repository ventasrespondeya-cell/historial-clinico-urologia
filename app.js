/* ==========================================================================
   1. IMPORTACIÓN Y CONFIGURACIÓN DE SUPABASE
   ========================================================================== */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ?? IMPORTANTE: REEMPLAZA ESTOS VALORES CON TUS CREDENCIALES DE SUPABASE ??
// Los encuentras en Supabase > Project Settings > API
const SUPABASE_URL = 'https://obwptfjxedepmahxpvnf.supabase.com'; 
const SUPABASE_ANON_KEY = 'sb_publishable_H93V7eiO1cOrLfvxab5rRg__mQMti2D';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Variable global para almacenar el paciente seleccionado actualmente
let pacienteActual = null;

/* ==========================================================================
   2. INICIALIZACIÓN DE EVENTOS (Cuando el DOM carga)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    configurarModales();
    configurarEventosPrincipales();
});

function configurarEventosPrincipales() {
    // Búsqueda de pacientes
    document.getElementById('btnBuscarPaciente')?.addEventListener('click', buscarPaciente);
    document.getElementById('inputBusqueda')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') buscarPaciente();
    });

    // Guardar formularios
    document.getElementById('formPaciente')?.addEventListener('submit', guardarPaciente);
    document.getElementById('formConsulta')?.addEventListener('submit', guardarConsulta);
    document.getElementById('formCirugia')?.addEventListener('submit', guardarCirugia);
}

/* ==========================================================================
   3. MANEJO DE MODALES (VENTANAS FLOTANTES)
   ========================================================================== */
function configurarModales() {
    // Botones para abrir modales
    document.getElementById('btnRegistrarPaciente')?.addEventListener('click', () => abrirModal('modalPaciente'));
    document.getElementById('btnNuevaConsulta')?.addEventListener('click', () => abrirModal('modalConsulta'));
    document.getElementById('btnNuevaCirugia')?.addEventListener('click', () => abrirModal('modalCirugia'));

    // Botones (X) para cerrar
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.target.closest('.modal').id;
            cerrarModal(modalId);
        });
    });

    // Cerrar al hacer clic fuera del contenido del modal
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            cerrarModal(e.target.id);
        }
    });
}

function abrirModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
}

function cerrarModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('active');
        // Opcional: Limpiar el formulario al cerrar
        const form = modal.querySelector('form');
        if(form) form.reset();
    }
}

/* ==========================================================================
   4. BÚSQUEDA DE PACIENTES
   ========================================================================== */
async function buscarPaciente() {
    const termino = document.getElementById('inputBusqueda').value.trim();
    
    if (!termino) {
        alert("Por favor, ingrese una cédula o nombre para buscar.");
        return;
    }

    try {
        // Buscar en Supabase por cédula o nombre/apellido ignorando mayúsculas/minúsculas (ilike)
        const { data, error } = await supabase
            .from('pacientes')
            .select('*')
            .or(`cedula.ilike.%${termino}%,nombres.ilike.%${termino}%,apellidos.ilike.%${termino}%`)
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            // Paciente encontrado
            pacienteActual = data[0];
            mostrarFichaPaciente(pacienteActual);
            cargarHistorialCronologico(pacienteActual.id);
        } else {
            // Paciente no encontrado
            pacienteActual = null;
            ocultarFichaPaciente();
            alert("Paciente no encontrado. Puede registrarlo ahora.");
            
            // Abrir modal y prellenar cédula si el término parece una cédula venezolana
            abrirModal('modalPaciente');
            if(termino.toUpperCase().startsWith('V-') || termino.toUpperCase().startsWith('E-')) {
                const inputCedula = document.getElementById('pacienteCedula');
                if(inputCedula) inputCedula.value = termino.toUpperCase();
            }
        }
    } catch (error) {
        console.error("Error en la búsqueda:", error);
        alert("Ocurrió un error al buscar en la base de datos.");
    }
}

function mostrarFichaPaciente(paciente) {
    // Mostrar el contenedor de la ficha
    document.getElementById('fichaPacienteContainer').style.display = 'block';
    
    // Habilitar los botones de nueva consulta/cirugía
    document.getElementById('btnNuevaConsulta').disabled = false;
    document.getElementById('btnNuevaCirugia').disabled = false;

    // Rellenar datos en el HTML (Asegúrate de que estos IDs existan en tu index.html)
    document.getElementById('displayCedula').innerText = paciente.cedula || 'N/A';
    document.getElementById('displayNombre').innerText = `${paciente.nombres} ${paciente.apellidos}`;
    document.getElementById('displayTelefono').innerText = paciente.telefono || 'N/A';
    document.getElementById('displayAntecedentes').innerText = paciente.antecedentes_medicos || 'Ninguno registrado';
    document.getElementById('displayAlergias').innerText = paciente.alergias || 'Sin alergias conocidas';
}

function ocultarFichaPaciente() {
    const contenedor = document.getElementById('fichaPacienteContainer');
    if(contenedor) contenedor.style.display = 'none';
    
    document.getElementById('btnNuevaConsulta').disabled = true;
    document.getElementById('btnNuevaCirugia').disabled = true;
    document.getElementById('timelineContainer').innerHTML = ''; // Limpiar timeline
}

/* ==========================================================================
   5. HISTORIAL CRONOLÓGICO DESCENDENTE (TIMELINE)
   ========================================================================== */
async function cargarHistorialCronologico(pacienteId) {
    const contenedor = document.getElementById('timelineContainer');
    contenedor.innerHTML = '<p>Cargando historial...</p>';

    try {
        // 1. Obtener Consultas
        const { data: consultas, error: errConsultas } = await supabase
            .from('consultas_urologicas')
            .select('*')
            .eq('paciente_id', pacienteId);
        if (errConsultas) throw errConsultas;

        // 2. Obtener Cirugías/Procedimientos
        const { data: cirugias, error: errCirugias } = await supabase
            .from('cirugias_procedimientos')
            .select('*')
            .eq('paciente_id', pacienteId);
        if (errCirugias) throw errCirugias;

        // 3. Unir y Formatear Listas
        const historial = [
            ...consultas.map(c => ({
                id: c.id,
                tipo: 'Consulta',
                fecha: new Date(c.fecha_consulta),
                titulo: 'Consulta Urológica',
                descripcion: `Motivo: ${c.motivo_consulta}`,
                detalles: `Diagnóstico: ${c.diagnostico || 'N/A'}<br>Plan: ${c.plan_tratamiento || 'N/A'} <br>PSA Total: ${c.psa_total || '-'}`,
                claseBadge: 'badge-consulta'
            })),
            ...cirugias.map(c => ({
                id: c.id,
                tipo: 'Cirugía/Procedimiento',
                fecha: new Date(c.fecha_procedimiento),
                titulo: c.tipo_procedimiento,
                descripcion: `Diagnóstico Preoperatorio: ${c.diagnostico_preoperatorio}`,
                detalles: `Hallazgos: ${c.hallazgos_quirurgicos || 'N/A'}<br>Complicaciones: ${c.complicaciones || 'Ninguna'}`,
                claseBadge: 'badge-cirugia'
            }))
        ];

        // 4. Ordenar cronológicamente (Descendente: más reciente primero)
        historial.sort((a, b) => b.fecha - a.fecha);

        // 5. Renderizar en el HTML
        if (historial.length === 0) {
            contenedor.innerHTML = '<p>No hay registros médicos para este paciente.</p>';
            return;
        }

        contenedor.innerHTML = ''; // Limpiar mensaje de carga
        const divTimeline = document.createElement('div');
        divTimeline.className = 'timeline';

        historial.forEach(item => {
            const fechaFormateada = item.fecha.toLocaleDateString('es-VE', { 
                year: 'numeric', month: 'short', day: 'numeric' 
            });

            const elemento = `
                <div class="timeline-item">
                    <div class="timeline-card">
                        <div class="timeline-header">
                            <span class="timeline-date">${fechaFormateada}</span>
                            <span class="badge ${item.claseBadge}">${item.tipo}</span>
                        </div>
                        <div class="timeline-content">
                            <h3>${item.titulo}</h3>
                            <p><strong>${item.descripcion}</strong></p>
                            <p class="details" style="font-size: 0.9em; color: var(--gray-600);">${item.detalles}</p>
                        </div>
                    </div>
                </div>
            `;
            divTimeline.innerHTML += elemento;
        });

        contenedor.appendChild(divTimeline);

    } catch (error) {
        console.error("Error cargando historial:", error);
        contenedor.innerHTML = '<p>Error al cargar el historial clínico.</p>';
    }
}

/* ==========================================================================
   6. GUARDAR NUEVOS REGISTROS
   ========================================================================== */

// Registrar Paciente Nuevo
async function guardarPaciente(e) {
    e.preventDefault();
    
    // Recolectar datos
    const nuevoPaciente = {
        cedula: document.getElementById('pacienteCedula').value.toUpperCase().trim(),
        nombres: document.getElementById('pacienteNombres').value.trim(),
        apellidos: document.getElementById('pacienteApellidos').value.trim(),
        telefono: document.getElementById('pacienteTelefono').value.trim(),
        antecedentes_medicos: document.getElementById('pacienteAntecedentes').value.trim(),
        alergias: document.getElementById('pacienteAlergias').value.trim(),
    };

    try {
        const { data, error } = await supabase
            .from('pacientes')
            .insert([nuevoPaciente])
            .select();

        if (error) throw error;

        alert("Paciente registrado exitosamente.");
        cerrarModal('modalPaciente');
        
        // Cargar inmediatamente el nuevo paciente en pantalla
        pacienteActual = data[0];
        mostrarFichaPaciente(pacienteActual);
        cargarHistorialCronologico(pacienteActual.id);
        
    } catch (error) {
        console.error("Error guardando paciente:", error);
        alert("Error al registrar paciente. Verifica que la cédula no esté duplicada.");
    }
}

// Registrar Nueva Consulta
async function guardarConsulta(e) {
    e.preventDefault();
    if(!pacienteActual) return alert("Seleccione un paciente primero");

    const nuevaConsulta = {
        paciente_id: pacienteActual.id,
        fecha_consulta: document.getElementById('consultaFecha').value || new Date().toISOString(),
        motivo_consulta: document.getElementById('consultaMotivo').value.trim(),
        sintomatologia_ipss: document.getElementById('consultaIpss').value || null,
        psa_total: document.getElementById('consultaPsaTotal').value || null,
        psa_libre: document.getElementById('consultaPsaLibre').value || null,
        examen_fisico: document.getElementById('consultaExamen').value.trim(),
        diagnostico: document.getElementById('consultaDiagnostico').value.trim(),
        plan_tratamiento: document.getElementById('consultaPlan').value.trim()
    };

    try {
        const { error } = await supabase.from('consultas_urologicas').insert([nuevaConsulta]);
        if (error) throw error;

        alert("Consulta guardada exitosamente.");
        cerrarModal('modalConsulta');
        cargarHistorialCronologico(pacienteActual.id); // Actualizar timeline

    } catch (error) {
        console.error("Error guardando consulta:", error);
        alert("Error al guardar la consulta.");
    }
}

// Registrar Nueva Cirugía / Procedimiento
async function guardarCirugia(e) {
    e.preventDefault();
    if(!pacienteActual) return alert("Seleccione un paciente primero");

    const nuevaCirugia = {
        paciente_id: pacienteActual.id,
        fecha_procedimiento: document.getElementById('cirugiaFecha').value || new Date().toISOString(),
        tipo_procedimiento: document.getElementById('cirugiaTipo').value.trim(),
        diagnostico_preoperatorio: document.getElementById('cirugiaDxPre').value.trim(),
        hallazgos_quirurgicos: document.getElementById('cirugiaHallazgos').value.trim(),
        cirujano_notas: document.getElementById('cirugiaProtocolo').value.trim(), // Protocolo operatorio
        complicaciones: document.getElementById('cirugiaComplicaciones').value.trim(),
        plan_postoperatorio: document.getElementById('cirugiaPlanPost').value.trim()
    };

    try {
        const { error } = await supabase.from('cirugias_procedimientos').insert([nuevaCirugia]);
        if (error) throw error;

        alert("Cirugía/Procedimiento guardado exitosamente.");
        cerrarModal('modalCirugia');
        cargarHistorialCronologico(pacienteActual.id); // Actualizar timeline

    } catch (error) {
        console.error("Error guardando cirugía:", error);
        alert("Error al guardar el procedimiento quirúrgico.");
    }
}