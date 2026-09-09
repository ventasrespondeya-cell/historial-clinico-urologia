import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://obwptfjxedepmahxpvnf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_H93V7eiO1cOrLfvxab5rRg__mQMti2D';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let pacienteActual = null;
let registrosHistorial = [];

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

function configurarModales() {
    document.querySelectorAll('[data-modal-target]').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-modal-target');
            if ((targetId === 'modal-nueva-consulta' || targetId === 'modal-nueva-cirugia') && !pacienteActual) {
                alert('Por favor, busque y seleccione un paciente primero.');
                return;
            }
            abrirModal(targetId);
        });
    });

    document.querySelectorAll('[data-modal-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const dialog = btn.closest('dialog');
            if (dialog) cerrarModal(dialog);
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
    if (typeof dialog === 'string') dialog = document.getElementById(dialog);
    if (dialog && typeof dialog.close === 'function') {
        dialog.close();
        const form = dialog.querySelector('form');
        if (form) form.reset();
    }
}

async function buscarPaciente() {
    const input = document.getElementById('input-buscar-paciente');
    const termino = input ? input.value.trim() : '';
    if (!termino) return alert('Ingrese un número de cédula o nombre.');

    try {
        const soloNumeros = termino.replace(/^[VEve]-?/, '');
        const { data, error } = await supabase
            .from('pacientes')
            .select('*')
            .or(`cedula.ilike.%${soloNumeros}%,nombre_completo.ilike.%${termino}%`)
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            pacienteActual = data[0];
            mostrarFichaPaciente(pacienteActual);
            cargarHistorialCronologico(pacienteActual.id);
        } else {
            pacienteActual = null;
            ocultarFichaPaciente();
            alert('Paciente no encontrado.');
            const inputRegCedula = document.getElementById('reg-cedula');
            if (inputRegCedula) inputRegCedula.value = soloNumeros;
            abrirModal('modal-registrar-paciente');
        }
    } catch (error) {
        alert(`Error al buscar: ${error.message || error}`);
    }
}

function mostrarFichaPaciente(paciente) {
    document.getElementById('estado-vacio').hidden = true;
    document.getElementById('ficha-paciente').hidden = false;
    document.getElementById('seccion-historial').hidden = false;

    document.getElementById('ficha-paciente-nombre').innerText = `${paciente.apellidos}, ${paciente.nombres}`;
    document.getElementById('dato-cedula').innerText = paciente.cedula || 'N/A';
    
    const antMedicos = typeof paciente.antecedentes_medicos === 'object' && paciente.antecedentes_medicos !== null
        ? paciente.antecedentes_medicos.descripcion || ''
        : paciente.antecedentes_medicos;

    document.getElementById('dato-antecedentes').innerText = antMedicos || 'Sin antecedentes.';
    document.getElementById('dato-alergias').innerText = paciente.alergias || 'Sin alergias.';
}

function ocultarFichaPaciente() {
    document.getElementById('estado-vacio').hidden = false;
    document.getElementById('ficha-paciente').hidden = true;
    document.getElementById('seccion-historial').hidden = true;
}

async function cargarHistorialCronologico(pacienteId) {
    const listaTimeline = document.getElementById('timeline-lista');
    listaTimeline.innerHTML = '<li>Cargando historial...</li>';

    try {
        const [resConsultas, resCirugias] = await Promise.all([
            supabase.from('consultas_urologicas').select('*').eq('paciente_id', pacienteId),
            supabase.from('procedimientos_quirurgicos').select('*').eq('paciente_id', pacienteId)
        ]);

        if (resConsultas.error) throw resConsultas.error;
        if (resCirugias.error) throw resCirugias.error;

        registrosHistorial = [
            ...resConsultas.data.map(c => ({
                id: c.id,
                tipoClase: 'consulta',
                etiqueta: 'Consulta',
                rawFecha: new Date(c.fecha_consulta),
                titulo: c.diagnostico ? `Consulta: ${c.diagnostico}` : 'Consulta Urológica',
                extracto: c.motivo_consulta,
                datosCompletos: c
            })),
            ...resCirugias.data.map(c => ({
                id: c.id,
                tipoClase: 'cirugia',
                etiqueta: 'Procedimiento',
                rawFecha: new Date(c.fecha_procedimiento),
                titulo: c.tipo_procedimiento,
                extracto: c.diagnostico_preoperatorio || 'Procedimiento urológico',
                datosCompletos: c
            }))
        ].sort((a, b) => b.rawFecha - a.rawFecha);

        listaTimeline.innerHTML = '';
        registrosHistorial.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `
                <strong>${item.etiqueta}</strong> - ${item.rawFecha.toLocaleDateString()}<br>
                <h3>${item.titulo}</h3>
                <p>${item.extracto}</p>
                <button type="button" class="timeline__detail-btn" data-registro-id="${item.id}">Ver detalle</button>
            `;
            listaTimeline.appendChild(li);
        });
    } catch (error) {
        listaTimeline.innerHTML = '<li>Error al cargar el historial.</li>';
    }
}

function configurarDetallesHistorial() {
    const listaTimeline = document.getElementById('timeline-lista');
    if (!listaTimeline) return;
    listaTimeline.addEventListener('click', (e) => {
        if (e.target.classList.contains('timeline__detail-btn')) {
            const regId = e.target.getAttribute('data-registro-id');
            const item = registrosHistorial.find(r => r.id === regId);
            if (item) mostrarDetalleModal(item);
        }
    });
}

function mostrarDetalleModal(item) {
    const contenedor = document.getElementById('modal-detalle-contenido');
    const d = item.datosCompletos;

    if (item.tipoClase === 'consulta') {
        contenedor.innerHTML = `
            <p><strong>Motivo:</strong> ${d.motivo_consulta}</p>
            <p><strong>IPSS Total:</strong> ${d.puntaje_ipss_total || 'N/A'}</p>
            <p><strong>PSA Total:</strong> ${d.psa_total || 'N/A'}</p>
            <p><strong>Diagnóstico:</strong> ${d.diagnostico || 'N/A'}</p>
        `;
    } else {
        contenedor.innerHTML = `
            <p><strong>Procedimiento:</strong> ${d.tipo_procedimiento}</p>
            <p><strong>Dx Preop:</strong> ${d.diagnostico_preoperatorio || 'N/A'}</p>
            <p><strong>Notas:</strong> ${d.cirujano_notas || 'N/A'}</p>
        `;
    }
    abrirModal('modal-detalle-registro');
}

function configurarFormularios() {
    document.getElementById('form-registrar-paciente')?.addEventListener('submit', guardarPaciente);
    document.getElementById('form-nueva-consulta')?.addEventListener('submit', guardarConsulta);
    document.getElementById('form-nueva-cirugia')?.addEventListener('submit', guardarCirugia);
}

async function guardarPaciente(e) {
    e.preventDefault();
    const cedulaCompleta = `${document.getElementById('reg-tipo-cedula').value}-${document.getElementById('reg-cedula').value.trim()}`;
    const textoAnt = document.getElementById('reg-antecedentes-medicos').value.trim();

    const datosPaciente = {
        cedula: cedulaCompleta,
        nombres: document.getElementById('reg-nombres').value.trim(),
        apellidos: document.getElementById('reg-apellidos').value.trim(),
        fecha_nacimiento: document.getElementById('reg-fecha-nacimiento').value || null,
        telefono: document.getElementById('reg-telefono').value.trim() || null,
        email: document.getElementById('reg-email').value.trim() || null,
        antecedentes_medicos: textoAnt ? { descripcion: textoAnt } : {},
        antecedentes_quirurgicos: document.getElementById('reg-antecedentes-quirurgicos').value.trim() || null,
        alergias: document.getElementById('reg-alergias').value.trim() || null
    };

    try {
        const { data: existente } = await supabase.from('pacientes').select('id').eq('cedula', cedulaCompleta).maybeSingle();
        let res;
        if (existente) {
            res = await supabase.from('pacientes').update(datosPaciente).eq('id', existente.id).select();
        } else {
            res = await supabase.from('pacientes').insert([datosPaciente]).select();
        }
        if (res.error) throw res.error;

        alert('Paciente guardado.');
        cerrarModal('modal-registrar-paciente');
        pacienteActual = res.data[0];
        mostrarFichaPaciente(pacienteActual);
        cargarHistorialCronologico(pacienteActual.id);
    } catch (err) {
        alert(`Error al guardar paciente: ${err.message}`);
    }
}

async function guardarConsulta(e) {
    e.preventDefault();
    if (!pacienteActual) return;

    const ipssTotal = (parseInt(document.getElementById('con-ipss-vaciado')?.value) || 0) +
                      (parseInt(document.getElementById('con-ipss-frecuencia')?.value) || 0);

    const nuevaConsulta = {
        paciente_id: pacienteActual.id,
        fecha_consulta: new Date().toISOString(),
        motivo_consulta: document.getElementById('con-motivo').value.trim(),
        sintomatologia_ipss: { vaciado: parseInt(document.getElementById('con-ipss-vaciado')?.value) || 0 },
        puntaje_ipss_total: ipssTotal,
        examen_fisico: { tacto_rectal: document.getElementById('con-tacto-rectal')?.value.trim() || '' },
        psa_total: parseFloat(document.getElementById('con-psa-total')?.value) || null,
        psa_libre: parseFloat(document.getElementById('con-psa-libre')?.value) || null,
        diagnostico: document.getElementById('con-diagnostico').value.trim()
    };

    try {
        const { error } = await supabase.from('consultas_urologicas').insert([nuevaConsulta]);
        if (error) throw error;
        alert('Consulta registrada.');
        cerrarModal('modal-nueva-consulta');
        cargarHistorialCronologico(pacienteActual.id);
    } catch (err) {
        alert(`Error al guardar consulta: ${err.message}`);
    }
}

async function guardarCirugia(e) {
    e.preventDefault();
    if (!pacienteActual) return;

    const nuevaCirugia = {
        paciente_id: pacienteActual.id,
        fecha_procedimiento: new Date().toISOString(),
        tipo_procedimiento: document.getElementById('cir-tipo').value,
        diagnostico_preoperatorio: document.getElementById('cir-diagnostico-pre').value.trim() || null,
        cirujano_notas: document.getElementById('cir-protocolo').value.trim() || null
    };

    try {
        const { error } = await supabase.from('procedimientos_quirurgicos').insert([nuevaCirugia]);
        if (error) throw error;
        alert('Procedimiento registrado.');
        cerrarModal('modal-nueva-cirugia');
        cargarHistorialCronologico(pacienteActual.id);
    } catch (err) {
        alert(`Error al guardar procedimiento: ${err.message}`);
    }
}
