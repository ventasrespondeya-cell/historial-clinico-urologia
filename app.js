/* ==========================================================================
   1. CONFIGURACIÓN E INICIALIZACIÓN DE SUPABASE
   ========================================================================== */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://obwptfjxedepmahxpvnf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_H93V7eiO1cOrLfvxab5rRg__mQMti2D';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Variables de estado global
let pacienteActual = null;
let registrosHistorial = [];

/* ==========================================================================
   2. EVENTOS PRINCIPALES
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    configurarModales();
    configurarEventosBusqueda();
    configurarFormularios();
    configurarDetallesHistorial();
});

function configurarEventosBusqueda() {
    const formBuscar = document.getElementById('form-buscar-paciente');
    if (formBuscar) {
        formBuscar.addEventListener('submit', (e) => {
            e.preventDefault();
            buscarPaciente();
        });
    }
}

/* ==========================================================================
   3. MANEJO DE MODALES (VENTANAS DIALOG NATIVAS)
   ========================================================================== */
function configurarModales() {
    // Abrir modales con atributo data-modal-target
    document.querySelectorAll('[data-modal-target]').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-modal-target');
            
            // Validar que se haya seleccionado un paciente para consulta o cirugía
            if ((targetId === 'modal-nueva-consulta' || targetId === 'modal-nueva-cirugia') && !pacienteActual) {
                alert('Por favor, busque y seleccione un paciente primero.');
                return;
            }
            abrirModal(targetId);
        });
    });

    // Cerrar modales con atributo data-modal-close
    document.querySelectorAll('[data-modal-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const dialog = btn.closest('dialog');
            if (dialog) cerrarModal(dialog);
        });
    });

    // Cerrar modal al hacer clic en el fondo (backdrop)
    document.querySelectorAll('dialog.modal').forEach(dialog => {
        dialog.addEventListener('click', (e) => {
            const rect = dialog.getBoundingClientRect();
            const isInDialog = (
                rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
                rect.left <= e.clientX && e.clientX <= rect.left + rect.width
            );
            if (!isInDialog) {
                cerrarModal(dialog);
            }
        });
    });
}

function abrirModal(modalId) {
    const dialog = document.getElementById(modalId);
    if (dialog && typeof dialog.showModal === 'function') {
        dialog.showModal();
    }
}

function cerrarModal(dialog) {
    if (typeof dialog === 'string') {
        dialog = document.getElementById(dialog);
    }
    if (dialog && typeof dialog.close === 'function') {
        dialog.close();
        const form = dialog.querySelector('form');
        if (form) form.reset();
    }
}

/* ==========================================================================
   4. BÚSQUEDA Y FICHA DEL PACIENTE
   ========================================================================== */
async function buscarPaciente() {
    const input = document.getElementById('input-buscar-paciente');
    const termino = input ? input.value.trim() : '';

    if (!termino) {
        alert('Por favor, ingrese un número de cédula o nombre para buscar.');
        return;
    }

    try {
        const { data, error } = await supabase
            .from('pacientes')
            .select('*')
            .or(`cedula.ilike.%${termino}%,nombres.ilike.%${termino}%,apellidos.ilike.%${termino}%`)
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            pacienteActual = data[0];
            mostrarFichaPaciente(pacienteActual);
            cargarHistorialCronologico(pacienteActual.id);
        } else {
            pacienteActual = null;
            ocultarFichaPaciente();
            alert('No se encontró ningún paciente con ese criterio. Puede registrarlo ahora.');
            
            // Prellenar cédula en el modal si el término parece una cédula
            const inputRegCedula = document.getElementById('reg-cedula');
            if (inputRegCedula) {
                const limpia = termino.replace(/^[VEve]-?/, '');
                inputRegCedula.value = limpia;
            }
            abrirModal('modal-registrar-paciente');
        }
    } catch (error) {
        console.error('Error al buscar paciente:', error);
        alert('Ocurrió un error al consultar la base de datos.');
    }
}

function calcularEdad(fechaNacimiento) {
    if (!fechaNacimiento) return 'N/A';
    const hoy = new Date();
    const nac = new Date(fechaNacimiento);
    let edad = hoy.getFullYear() - nac.getFullYear();
    const mes = hoy.getMonth() - nac.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nac.getDate())) {
        edad--;
    }
    return isNaN(edad) ? 'N/A' : `${edad} años`;
}

function mostrarFichaPaciente(paciente) {
    document.getElementById('estado-vacio').hidden = true;
    document.getElementById('ficha-paciente').hidden = false;
    document.getElementById('seccion-historial').hidden = false;

    document.getElementById('ficha-paciente-nombre').innerText = `${paciente.apellidos}, ${paciente.nombres}`;
    document.getElementById('dato-cedula').innerText = paciente.cedula || 'N/A';
    document.getElementById('dato-edad').innerText = calcularEdad(paciente.fecha_nacimiento);
    document.getElementById('dato-telefono').innerText = paciente.telefono || 'N/A';
    document.getElementById('dato-antecedentes').innerText = paciente.antecedentes_medicos || 'Ningún antecedente registrado.';
    document.getElementById('dato-alergias').innerText = paciente.alergias || 'Sin alergias conocidas.';
}

function ocultarFichaPaciente() {
    document.getElementById('estado-vacio').hidden = false;
    document.getElementById('ficha-paciente').hidden = true;
    document.getElementById('seccion-historial').hidden = true;
    document.getElementById('timeline-lista').innerHTML = '';
}

/* ==========================================================================
   5. HISTORIAL CRONOLÓGICO Y DETALLE
   ========================================================================== */
async function cargarHistorialCronologico(pacienteId) {
    const listaTimeline = document.getElementById('timeline-lista');
    listaTimeline.innerHTML = '<li class="timeline__entry"><p>Cargando historial...</p></li>';

    try {
        const [resConsultas, resCirugias] = await Promise.all([
            supabase.from('consultas_urologicas').select('*').eq('paciente_id', pacienteId),
            supabase.from('cirugias_procedimientos').select('*').eq('paciente_id', pacienteId)
        ]);

        if (resConsultas.error) throw resConsultas.error;
        if (resCirugias.error) throw resCirugias.error;

        const consultas = resConsultas.data || [];
        const cirugias = resCirugias.data || [];

        registrosHistorial = [
            ...consultas.map(c => ({
                id: c.id,
                tipoClase: 'consulta',
                etiqueta: 'Consulta General',
                rawFecha: new Date(c.fecha_consulta),
                titulo: c.diagnostico ? `Consulta: ${c.diagnostico}` : 'Consulta Urológica',
                extracto: c.motivo_consulta ? `Motivo: ${c.motivo_consulta}` : 'Sin extracto.',
                datosCompletos: c
            })),
            ...cirugias.map(c => ({
                id: c.id,
                tipoClase: 'cirugia',
                etiqueta: 'Cirugía / Procedimiento',
                rawFecha: new Date(c.fecha_procedimiento),
                titulo: c.tipo_procedimiento || 'Procedimiento Quirúrgico',
                extracto: c.diagnostico_preoperatorio ? `Dx Preop: ${c.diagnostico_preoperatorio}` : 'Procedimiento urológico.',
                datosCompletos: c
            }))
        ];

        // Ordenar descendentemente (más reciente primero)
        registrosHistorial.sort((a, b) => b.rawFecha - a.rawFecha);

        if (registrosHistorial.length === 0) {
            listaTimeline.innerHTML = '<li class="timeline__entry"><p>No hay registros médicos en el historial de este paciente.</p></li>';
            return;
        }

        listaTimeline.innerHTML = '';
        registrosHistorial.forEach(item => {
            const fechaTxt = item.rawFecha.toLocaleDateString('es-VE', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
            const fechaIso = item.rawFecha.toISOString().split('T')[0];

            const li = document.createElement('li');
            li.className = `timeline__entry timeline__entry--${item.tipoClase}`;
            li.setAttribute('data-tipo', item.tipoClase);

            li.innerHTML = `
                <span class="timeline__marker" aria-hidden="true"></span>
                <article class="timeline__card">
                  <div class="timeline__meta">
                    <span class="tag tag--${item.tipoClase}">${item.etiqueta}</span>
                    <time class="timeline__date" datetime="${fechaIso}">${fechaTxt}</time>
                  </div>
                  <h3 class="timeline__title">${item.titulo}</h3>
                  <p class="timeline__excerpt">${item.extracto}</p>
                  <button type="button" class="btn btn--link timeline__detail-btn" data-registro-id="${item.id}">Ver detalle completo</button>
                </article>
            `;
            listaTimeline.appendChild(li);
        });

    } catch (error) {
        console.error('Error cargando historial:', error);
        listaTimeline.innerHTML = '<li class="timeline__entry"><p>Error al cargar el historial clínico.</p></li>';
    }
}

function configurarDetallesHistorial() {
    const listaTimeline = document.getElementById('timeline-lista');
    if (!listaTimeline) return;

    listaTimeline.addEventListener('click', (e) => {
        if (e.target.classList.contains('timeline__detail-btn')) {
            const regId = e.target.getAttribute('data-registro-id');
            const item = registrosHistorial.find(r => r.id === regId);
            if (item) {
                mostrarDetalleModal(item);
            }
        }
    });
}

function mostrarDetalleModal(item) {
    const contenedor = document.getElementById('modal-detalle-contenido');
    const tituloModal = document.getElementById('modal-detalle-titulo');
    
    if (!contenedor || !tituloModal) return;

    const fechaTxt = item.rawFecha.toLocaleDateString('es-VE', {
        year: 'numeric', month: 'long', day: 'numeric'
    });

    tituloModal.innerText = `${item.etiqueta} - ${fechaTxt}`;
    const d = item.datosCompletos;

    if (item.tipoClase === 'consulta') {
        let ipssTxt = 'No evaluado';
        if (d.sintomatologia_ipss) {
            if (typeof d.sintomatologia_ipss === 'object') {
                ipssTxt = `Puntaje Total: ${d.sintomatologia_ipss.total || '-'} / 35 (Calidad de vida: ${d.sintomatologia_ipss.calidad_vida || '-'})`;
            } else {
                ipssTxt = d.sintomatologia_ipss;
            }
        }

        contenedor.innerHTML = `
            <div class="detalle-sec">
                <h4>Motivo de Consulta</h4>
                <p>${d.motivo_consulta || 'No especificado'}</p>
            </div>
            <div class="detalle-sec">
                <h4>Evaluación IPSS & Tacto Rectal</h4>
                <p><strong>IPSS:</strong> ${ipssTxt}</p>
                <p><strong>Tacto Rectal:</strong> ${d.examen_tacto_rectal || d.examen_fisico || 'No realizado'}</p>
            </div>
            <div class="detalle-sec">
                <h4>Antígeno Prostático (PSA) & Ecografía</h4>
                <p><strong>PSA Total:</strong> ${d.psa_total ? d.psa_total + ' ng/mL' : 'N/A'} | <strong>PSA Libre:</strong> ${d.psa_libre ? d.psa_libre + ' ng/mL' : 'N/A'}</p>
                <p><strong>Hallazgos Eco:</strong> ${d.ecografia_hallazgos || 'No registrados'}</p>
            </div>
            <div class="detalle-sec">
                <h4>Diagnóstico y Tratamiento</h4>
                <p><strong>Diagnóstico:</strong> ${d.diagnostico || 'Pendiente'}</p>
                <p><strong>Plan de Tratamiento:</strong> ${d.plan_tratamiento || 'Sin tratamiento indicado'}</p>
            </div>
            ${d.notas_adicionales ? `<div class="detalle-sec"><h4>Notas Adicionales</h4><p>${d.notas_adicionales}</p></div>` : ''}
        `;
    } else {
        contenedor.innerHTML = `
            <div class="detalle-sec">
                <h4>Intervención</h4>
                <p><strong>Tipo:</strong> ${d.tipo_procedimiento || 'Procedimiento'}</p>
                <p><strong>Dx Preoperatorio:</strong> ${d.diagnostico_preoperatorio || 'N/A'}</p>
                <p><strong>Dx Postoperatorio:</strong> ${d.diagnostico_postoperatorio || 'N/A'}</p>
            </div>
            <div class="detalle-sec">
                <h4>Protocolo Operatorio & Hallazgos</h4>
                <p><strong>Notas del Cirujano:</strong> ${d.cirujano_notas || 'Sin notas'}</p>
                <p><strong>Hallazgos Quirúrgicos:</strong> ${d.hallazgos_quirurgicos || 'Sin hallazgos descritos'}</p>
            </div>
            <div class="detalle-sec">
                <h4>Complicaciones & Plan Postoperatorio</h4>
                <p><strong>Complicaciones:</strong> ${d.complicaciones || 'Ninguna registrada'}</p>
                <p><strong>Plan Postoperatorio:</strong> ${d.plan_postoperatorio || 'Sin indicaciones'}</p>
            </div>
        `;
    }

    abrirModal('modal-detalle-registro');
}

/* ==========================================================================
   6. GUARDAR FORMULARIOS EN SUPABASE
   ========================================================================== */
function configurarFormularios() {
    document.getElementById('form-registrar-paciente')?.addEventListener('submit', guardarPaciente);
    document.getElementById('form-nueva-consulta')?.addEventListener('submit', guardarConsulta);
    document.getElementById('form-nueva-cirugia')?.addEventListener('submit', guardarCirugia);
}

// Registrar nuevo paciente
async function guardarPaciente(e) {
    e.preventDefault();

    const tipoCedula = document.getElementById('reg-tipo-cedula').value;
    const numCedula = document.getElementById('reg-cedula').value.trim();
    const tel = document.getElementById('reg-telefono').value.trim();

    const nuevoPaciente = {
        cedula: `${tipoCedula}-${numCedula}`,
        nombres: document.getElementById('reg-nombres').value.trim(),
        apellidos: document.getElementById('reg-apellidos').value.trim(),
        fecha_nacimiento: document.getElementById('reg-fecha-nacimiento').value || null,
        telefono: tel ? `+58 ${tel}` : null,
        email: document.getElementById('reg-email').value.trim() || null,
        antecedentes_medicos: document.getElementById('reg-antecedentes-medicos').value.trim() || null,
        antecedentes_quirurgicos: document.getElementById('reg-antecedentes-quirurgicos').value.trim() || null,
        alergias: document.getElementById('reg-alergias').value.trim() || null
    };

    try {
        const { data, error } = await supabase
            .from('pacientes')
            .insert([nuevoPaciente])
            .select();

        if (error) throw error;

        alert('Paciente registrado exitosamente.');
        cerrarModal('modal-registrar-paciente');

        pacienteActual = data[0];
        mostrarFichaPaciente(pacienteActual);
        cargarHistorialCronologico(pacienteActual.id);

    } catch (error) {
        console.error('Error al guardar paciente:', error);
        alert('Error al registrar el paciente. Verifique que la cédula no esté registrada.');
    }
}

// Registrar nueva consulta urológica
async function guardarConsulta(e) {
    e.preventDefault();
    if (!pacienteActual) return alert('Seleccione un paciente primero.');

    // Recolectar datos de IPSS
    const ipssVaciado = parseInt(document.getElementById('con-ipss-vaciado').value) || 0;
    const ipssFrecuencia = parseInt(document.getElementById('con-ipss-frecuencia').value) || 0;
    const ipssIntermitencia = parseInt(document.getElementById('con-ipss-intermitencia').value) || 0;
    const ipssUrgencia = parseInt(document.getElementById('con-ipss-urgencia').value) || 0;
    const ipssChorro = parseInt(document.getElementById('con-ipss-chorro').value) || 0;
    const ipssEsfuerzo = parseInt(document.getElementById('con-ipss-esfuerzo').value) || 0;
    const ipssNocturia = parseInt(document.getElementById('con-ipss-nocturia').value) || 0;
    const ipssCalidadVida = parseInt(document.getElementById('con-ipss-calidad-vida').value) || 0;

    const ipssTotal = ipssVaciado + ipssFrecuencia + ipssIntermitencia + ipssUrgencia + ipssChorro + ipssEsfuerzo + ipssNocturia;

    const nuevaConsulta = {
        paciente_id: pacienteActual.id,
        fecha_consulta: document.getElementById('con-fecha').value ? new Date(document.getElementById('con-fecha').value).toISOString() : new Date().toISOString(),
        motivo_consulta: document.getElementById('con-motivo').value.trim(),
        sintomatologia_ipss: {
            total: ipssTotal,
            vaciado: ipssVaciado,
            frecuencia: ipssFrecuencia,
            intermitencia: ipssIntermitencia,
            urgencia: ipssUrgencia,
            chorro: ipssChorro,
            esfuerzo: ipssEsfuerzo,
            nocturia: ipssNocturia,
            calidad_vida: ipssCalidadVida
        },
        examen_tacto_rectal: document.getElementById('con-tacto-rectal').value.trim() || null,
        psa_total: parseFloat(document.getElementById('con-psa-total').value) || null,
        psa_libre: parseFloat(document.getElementById('con-psa-libre').value) || null,
        ecografia_hallazgos: document.getElementById('con-eco').value.trim() || null,
        diagnostico: document.getElementById('con-diagnostico').value.trim(),
        plan_tratamiento: document.getElementById('con-plan').value.trim() || null,
        notas_adicionales: document.getElementById('con-notas').value.trim() || null
    };

    try {
        const { error } = await supabase.from('consultas_urologicas').insert([nuevaConsulta]);
        if (error) throw error;

        alert('Consulta urológica guardada exitosamente.');
        cerrarModal('modal-nueva-consulta');
        cargarHistorialCronologico(pacienteActual.id);

    } catch (error) {
        console.error('Error al guardar consulta:', error);
        alert('Ocurrió un error al guardar la consulta.');
    }
}

// Registrar nueva cirugía o procedimiento
async function guardarCirugia(e) {
    e.preventDefault();
    if (!pacienteActual) return alert('Seleccione un paciente primero.');

    const nuevaCirugia = {
        paciente_id: pacienteActual.id,
        fecha_procedimiento: document.getElementById('cir-fecha').value ? new Date(document.getElementById('cir-fecha').value).toISOString() : new Date().toISOString(),
        tipo_procedimiento: document.getElementById('cir-tipo').value,
        diagnostico_preoperatorio: document.getElementById('cir-diagnostico-pre').value.trim() || null,
        diagnostico_postoperatorio: document.getElementById('cir-diagnostico-post').value.trim() || null,
        cirujano_notas: document.getElementById('cir-protocolo').value.trim() || null,
        hallazgos_quirurgicos: document.getElementById('cir-hallazgos').value.trim() || null,
        complicaciones: document.getElementById('cir-complicaciones').value.trim() || null,
        plan_postoperatorio: document.getElementById('cir-plan-post').value.trim() || null
    };

    try {
        const { error } = await supabase.from('cirugias_procedimientos').insert([nuevaCirugia]);
        if (error) throw error;

        alert('Procedimiento quirúrgico guardado exitosamente.');
        cerrarModal('modal-nueva-cirugia');
        cargarHistorialCronologico(pacienteActual.id);

    } catch (error) {
        console.error('Error al guardar cirugía:', error);
        alert('Ocurrió un error al guardar el procedimiento.');
    }
}
