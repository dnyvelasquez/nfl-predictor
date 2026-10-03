import { Component, OnInit, inject, computed, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { Etapa, ETAPAS } from '../../services/core/etapas';
import { AsignacionService } from '../../services/asignacion';
import { EquiposService, Equipo } from '../../services/equipos';
import { ParticipantesService, Participante } from '../../services/participantes';
import { GruposService, Grupo } from '../../services/grupos';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth/auth';
import { forkJoin } from 'rxjs';
import { Router, RouterModule } from '@angular/router';

type AsignacionRow = { id?: string; equipo_id: string; participante: string };

@Component({
  selector: 'app-asignacion',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    RouterModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTabsModule
  ],
  templateUrl: './asignacion.html',
  styleUrls: ['./asignacion.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Asignacion implements OnInit {
  private svc = inject(AsignacionService);
  private equiposService = inject(EquiposService);
  private participantesService = inject(ParticipantesService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private gruposService = inject(GruposService);

  // Solo el super usuario edita a mano (RLS también rechaza la escritura de los demás roles).
  esSuperusuario = toSignal(inject(AuthService).esSuperusuario$(), { initialValue: false });
  // El administrador solo puede usar la auto-asignación de temporada regular.
  puedeAutoAsignar = toSignal(inject(AuthService).puedeAutoAsignar$(), { initialValue: false });

  loading = signal(true);
  errorMsg = signal<string | null>(null);
  okMsg    = signal<string | null>(null);

  participantes = signal<Participante[]>([]);
  equipos       = signal<Equipo[]>([]);
  asignaciones  = signal<AsignacionRow[]>([]);

  grupos  = signal<Grupo[]>([]);
  grupoId = signal<string | null>(null);

  etapas = ETAPAS;
  etapaActiva = signal<Etapa>('regular');

  ngOnInit(): void { this.cargarBase(); }

  private cargarBase() {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.okMsg.set(null);

    forkJoin({
      disponibles: this.gruposService.gruposDisponibles$(),
      equipos:     this.equiposService.getEquipos(),
    }).subscribe({
      next: ({ disponibles, equipos }) => {
        this.grupos.set(disponibles.grupos);
        this.grupoId.set(disponibles.seleccionado);
        this.equipos.set(equipos);
        this.cargarGrupo();
      },
      error: (e) => {
        this.errorMsg.set(e?.message || 'No fue posible cargar la asignación');
        this.loading.set(false);
      }
    });
  }

  // Participantes y asignaciones dependen del grupo; los equipos no.
  private cargarGrupo() {
    const grupoId = this.grupoId();
    if (!grupoId) {
      this.participantes.set([]);
      this.asignaciones.set([]);
      this.errorMsg.set('Tu usuario no tiene un grupo asignado');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.participantesService.getParticipantes(grupoId).subscribe({
      next: (participantes) => {
        const ordPart = [...participantes].sort(
          (a, b) => (a.numero ?? 0) - (b.numero ?? 0) || a.nombre.localeCompare(b.nombre)
        );
        this.participantes.set(ordPart);
        this.cargarAsignaciones(this.etapaActiva());
      },
      error: (e) => {
        this.errorMsg.set(e?.message || 'No fue posible cargar los participantes');
        this.loading.set(false);
      }
    });
  }

  cambiarGrupo(grupoId: string) {
    this.grupoId.set(grupoId);
    this.gruposService.recordarGrupo(grupoId);
    this.errorMsg.set(null);
    this.okMsg.set(null);
    this.cargarGrupo();
  }

  private cargarAsignaciones(etapa: Etapa) {
    const grupoId = this.grupoId();
    if (!grupoId) return;
    this.loading.set(true);
    this.errorMsg.set(null);

    this.svc.getAsignaciones(etapa, grupoId).subscribe({
      next: (asign) => this.asignaciones.set(asign ?? []),
      error: (e) => this.errorMsg.set(e?.message || 'No fue posible cargar la asignación'),
      complete: () => this.loading.set(false)
    });
  }

  onTabChange(index: number) {
    const etapa = this.etapas[index]?.value;
    if (!etapa) return;
    this.etapaActiva.set(etapa);
    this.okMsg.set(null);
    this.cargarAsignaciones(etapa);
  }

  private equipoById = computed<Record<string, Equipo>>(() => {
    const map: Record<string, Equipo> = {};
    for (const e of this.equipos()) map[e.id] = e;
    return map;
  });

  divisiones = computed(() => {
    const set = new Set(this.equipos().map(e => e.division));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  equiposPorDivision = computed(() => {
    const mapDiv: Record<string, Equipo[]> = {};
    for (const d of this.divisiones()) mapDiv[d] = [];
    for (const e of this.equipos()) (mapDiv[e.division] ??= []).push(e);
    for (const d of Object.keys(mapDiv)) mapDiv[d].sort((a, b) => a.nombre.localeCompare(b.nombre));
    return mapDiv;
  });

  valorCelda(d: string, participanteNombre: string): string | null {
    const byId = this.equipoById();
    const row = this.asignaciones()
      .find(a => a.participante === participanteNombre && byId[a.equipo_id]?.division === d);
    return row ? row.equipo_id : null;
  }

  opcionesPara(d: string): Equipo[] {
    return this.equiposPorDivision()[d] ?? [];
  }

  asignadoA(equipoId: string): string[] {
    return this.asignaciones()
      .filter(a => a.equipo_id === equipoId)
      .map(a => a.participante);
  }

  onChangeCelda(division: string, participanteNombre: string, equipoId: string | null) {
    const grupoId = this.grupoId();
    if (!grupoId) return;
    this.loading.set(true);
    this.errorMsg.set(null);
    this.okMsg.set(null);

    this.svc.assignEquipo(participanteNombre, division, equipoId, this.etapaActiva(), grupoId).subscribe({
      next: () => {
        const byId = this.equipoById();
        const prev = this.asignaciones().filter(
          a => !(a.participante === participanteNombre && byId[a.equipo_id]?.division === division)
        );

        if (equipoId) {
          prev.push({ equipo_id: equipoId, participante: participanteNombre });
        }

        this.asignaciones.set(prev);
        this.okMsg.set('Asignación actualizada');
      },
      error: (e) => this.errorMsg.set(e?.message || 'No se pudo actualizar la asignación'),
      complete: () => this.loading.set(false),
    });
  }

  autoAsignarTemporadaRegular() {
    const grupoId = this.grupoId();
    if (!grupoId) return;
    const ok = confirm(
      `¿Auto-asignar la temporada regular por ranking? Esto reemplaza por completo la asignación actual de "Temporada Regular" del grupo "${this.nombreGrupo()}".`
    );
    if (!ok) return;

    this.loading.set(true);
    this.errorMsg.set(null);
    this.okMsg.set(null);

    this.svc.autoAsignarTemporadaRegular(grupoId).subscribe({
      next: ({ asignados }) => {
        this.okMsg.set(`Asignación por ranking completa (${asignados} equipos)`);
        this.cargarAsignaciones('regular');
      },
      error: (e) => {
        this.errorMsg.set(e?.message || 'No se pudo auto-asignar');
        this.loading.set(false);
      },
    });
  }

  resetAll() {
    const grupoId = this.grupoId();
    if (!grupoId) return;
    const label = this.etapas.find(e => e.value === this.etapaActiva())?.label ?? this.etapaActiva();
    const ok = confirm(`¿Quitar TODAS las asignaciones de "${label}" del grupo "${this.nombreGrupo()}"?`);
    if (!ok) return;

    this.loading.set(true);
    this.errorMsg.set(null);
    this.okMsg.set(null);

    this.svc.resetAsignaciones(this.etapaActiva(), grupoId).subscribe({
      next: () => {
        this.asignaciones.set([]);
        this.okMsg.set('Asignaciones reiniciadas');
      },
      error: (e) => this.errorMsg.set(e?.message || 'No se pudo reiniciar'),
      complete: () => this.loading.set(false),
    });
  }

  nombreGrupo(): string {
    return this.grupos().find(g => g.id === this.grupoId())?.nombre ?? '';
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
