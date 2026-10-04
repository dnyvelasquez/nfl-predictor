import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ParticipantesService } from '../../services/participantes';
import { GruposService, GrupoDisponible } from '../../services/grupos';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth/auth';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';

type Row = { id: string; nombre: string; numero: number };

@Component({
  selector: 'app-participantes',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatDividerModule,
    MatTableModule,
    MatIconModule,
    MatMenuModule,
    MatButtonModule,
    RouterModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './participantes.html',
  styleUrls: ['./participantes.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Participantes implements OnInit, OnDestroy {

  private fb = inject(FormBuilder);
  private svc = inject(ParticipantesService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private gruposService = inject(GruposService);

  // Solo el super usuario edita a mano (RLS también rechaza la escritura de los demás roles).
  esSuperusuario = toSignal(inject(AuthService).esSuperusuario$(), { initialValue: false });

  loading = false;
  errorMsg: string | null = null;
  okMsg: string | null = null;  

  participantes: Row[] = [];

  grupos: GrupoDisponible[] = [];

  // El sorteo (con su animación) lo pueden hacer también los administradores del grupo elegido.
  get puedeSortear(): boolean {
    const rol = this.grupos.find(g => g.id === this.grupoId)?.rol;
    return rol === 'superusuario' || rol === 'administrador';
  }
  grupoId: string | null = null;

  addForm = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
  });

  editForms: Record<string, FormGroup> = {};

  ngOnInit(): void {
    this.loading = true;
    this.gruposService.gruposDisponibles$().subscribe({
      next: ({ grupos, seleccionado }) => {
        this.grupos = grupos;
        this.grupoId = seleccionado;
        this.load();
      },
      error: (e) => {
        this.errorMsg = e?.message || 'No se pudieron cargar los grupos';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  cambiarGrupo(grupoId: string): void {
    this.grupoId = grupoId;
    this.gruposService.recordarGrupo(grupoId);
    this.editForms = {};
    this.load();
  }

  load(): void {
    this.loading = true; this.errorMsg = this.okMsg = null;
    if (!this.grupoId) {
      this.participantes = [];
      this.errorMsg = 'Tu usuario no pertenece a ningún grupo';
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }
    this.svc.getParticipantes(this.grupoId).pipe(
      finalize(() => { this.loading = false; this.cdr.detectChanges(); })
    ).subscribe({
      next: (rows) => { this.participantes = rows; },
      error: (e) => this.errorMsg = e?.message || 'No se pudieron cargar los participantes',
    });
  }

  add(): void {
    if (this.addForm.invalid || this.loading || !this.grupoId) {
      this.addForm.markAllAsTouched();
      return;
    }
    const { nombre } = this.addForm.value;
    this.loading = true; this.errorMsg = this.okMsg = null;

    this.svc.createParticipante(String(nombre), this.grupoId).pipe(
      finalize(() => { this.loading = false; this.cdr.detectChanges(); })
    ).subscribe({
      next: (row: Row) => {
        this.okMsg = 'Participante creado';
        this.addForm.reset();
        this.participantes = [...this.participantes, row]
          .sort((a, b) => a.numero - b.numero || a.nombre.localeCompare(b.nombre));
      },
      error: (e) => this.errorMsg = e?.message || 'No se pudo crear el participante',
    });
  }

  startEdit(p: Row): void {
    if (!this.editForms[p.id]) {
      this.editForms[p.id] = this.fb.group({
        numero: [Number(p.numero), [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
        nombre: [p.nombre, [Validators.required, Validators.minLength(2)]],
      });
    }
  }

  cancelEdit(p: Row): void {
    delete this.editForms[p.id];
  }

  saveEdit(p: Row): void {
    const fg = this.editForms[p.id];
    if (!fg || fg.invalid) { fg?.markAllAsTouched(); return; }

    const patch = {
      nombre: String(fg.value.nombre).trim(),
      numero: Number(fg.value.numero),
    };

    if (patch.nombre === p.nombre && patch.numero === Number(p.numero)) {
      this.cancelEdit(p);
      return;
    }

    // Se permite repetir el número para poder reasignar (p. ej. intercambiar dos);
    // solo se avisa, para que no quede repetido por descuido.
    const repetido = this.participantes.find(x => x.id !== p.id && Number(x.numero) === patch.numero);

    this.loading = true; this.errorMsg = this.okMsg = null;
    this.svc.updateParticipante(p.id, patch).pipe(
      finalize(() => { this.loading = false; this.cdr.detectChanges(); })
    ).subscribe({
      next: (row: Row) => {
        this.okMsg = repetido
          ? `Participante actualizado. Ojo: ${repetido.nombre} también tiene el número ${patch.numero}.`
          : 'Participante actualizado';
        this.participantes = this.participantes
          .map(x => x.id === p.id ? row : x)
          .sort((a, b) => a.numero - b.numero || a.nombre.localeCompare(b.nombre));
        this.cancelEdit(p);
      },
      error: (e) => this.errorMsg = e?.message || 'No se pudo actualizar',
    });
  }

  sortearNumeros(): void {
    if (this.loading || this.participantes.length === 0 || !this.grupoId) return;

    const ok = confirm('¿Asignar un número aleatorio a cada participante? Esto reemplazará los números actuales.');
    if (!ok) return;

    this.loading = true; this.errorMsg = this.okMsg = null;
    this.svc.asignarNumerosAleatorios(this.grupoId).pipe(
      finalize(() => { this.loading = false; this.cdr.detectChanges(); })
    ).subscribe({
      next: (rows: Row[]) => {
        this.participantes = rows;
        this.editForms = {};
        this.revelarSorteo(rows);
      },
      error: (e) => this.errorMsg = e?.message || 'No se pudieron asignar los números',
    });
  }

  // ===== Animación del sorteo =====
  // Como el sorteo se hace en público, cada número se revela uno a uno, del más
  // alto al más bajo: aparece grande en el centro, luego el nombre, y los dos se
  // encogen y vuelan a su fila (que hasta entonces está oculta). Las animaciones
  // son CSS; aquí solo se calcula el trayecto hacia la fila (depende del layout).

  @ViewChild('sorteoNumero') private numeroEl?: ElementRef<HTMLElement>;
  @ViewChild('sorteoNombre') private nombreEl?: ElementRef<HTMLElement>;

  sorteando = false;
  enVuelo = false;
  actual: Row | null = null;
  revelados = new Set<string>();
  private saltar = false;

  saltarSorteo(): void {
    this.saltar = true;
  }

  private esperar(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, this.saltar ? 0 : ms));
  }

  private async revelarSorteo(rows: Row[]): Promise<void> {
    try {
      const reducido = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (!reducido && rows.length > 0) {
        this.sorteando = true;
        this.saltar = false;
        this.revelados = new Set();
        this.cdr.detectChanges();

        for (const p of [...rows].sort((a, b) => b.numero - a.numero)) {
          if (this.saltar) break;
          await this.revelarUno(p);
          this.revelados.add(p.id);
          this.cdr.detectChanges();
        }
      }
    } catch (e) {
      // Si la animación falla, la capa se cierra igual: los números ya quedaron guardados.
      console.error('Falló la animación del sorteo', e);
    }
    this.sorteando = false;
    this.enVuelo = false;
    this.actual = null;
    this.okMsg = 'Números asignados aleatoriamente';
    this.cdr.detectChanges();
  }

  private async revelarUno(p: Row): Promise<void> {
    const destinoNumero = document.getElementById('num-' + p.id);
    const destinoNombre = document.getElementById('nom-' + p.id);
    destinoNumero?.closest('.row')?.scrollIntoView({ block: 'center', behavior: 'smooth' });

    this.actual = p;
    this.enVuelo = false;
    this.cdr.detectChanges();
    const numero = this.numeroEl?.nativeElement;
    const nombre = this.nombreEl?.nativeElement;
    if (!numero || !nombre) return;

    // Estado inicial: ocultos y en el centro, sin transición.
    for (const el of [numero, nombre]) {
      el.style.transition = 'none';
      el.style.transform = '';
      el.classList.remove('entra');
    }
    void numero.offsetWidth; // fuerza el reflow para que la animación de entrada se repita

    numero.classList.add('entra');
    await this.esperar(1000);
    nombre.classList.add('entra');
    await this.esperar(1200);

    this.enVuelo = true;
    this.cdr.detectChanges();
    this.volar(numero, destinoNumero);
    this.volar(nombre, destinoNombre);
    await this.esperar(800);
  }

  // Lleva el elemento hasta el centro del destino, escalado a su tamaño de letra.
  private volar(el: HTMLElement, destino: HTMLElement | null): void {
    if (!destino) return;
    const o = el.getBoundingClientRect();
    const d = destino.getBoundingClientRect();
    const escala = parseFloat(getComputedStyle(destino).fontSize) / parseFloat(getComputedStyle(el).fontSize);
    const dx = d.left + d.width / 2 - (o.left + o.width / 2);
    const dy = d.top + d.height / 2 - (o.top + o.height / 2);
    el.style.transition = 'transform 750ms cubic-bezier(0.55, 0, 0.2, 1)';
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${escala})`;
  }

  ngOnDestroy(): void {
    this.saltar = true;
  }

  remove(p: Row): void {
    const ok = confirm(`¿Eliminar a "${p.nombre}"? Esta acción no se puede deshacer.`);
    if (!ok) return;

    this.loading = true; this.errorMsg = this.okMsg = null;
    this.svc.deleteParticipante(p.id).pipe(
      finalize(() => { this.loading = false; this.cdr.detectChanges(); })
    ).subscribe({
      next: () => {
        this.okMsg = 'Participante eliminado';
        this.participantes = this.participantes.filter(x => x.id !== p.id);
        delete this.editForms[p.id];
      },
      error: (e) => this.errorMsg = e?.message || 'No se pudo eliminar',
    });
  }



  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }  

}
