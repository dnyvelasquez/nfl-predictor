import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NuevoUsuario } from './nuevo-usuario';

describe('NuevoUsuario', () => {
  let component: NuevoUsuario;
  let fixture: ComponentFixture<NuevoUsuario>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NuevoUsuario]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NuevoUsuario);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
