import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    ArrowRight,
    CheckCircle2,
    Clock,
    Eye,
    EyeOff,
    Lock,
    LoaderCircle,
    Mail,
    Menu,
    PackageCheck,
    Route,
    ShieldCheck,
    Truck,
    X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Página pública ("/login"): funciona como a vitrine institucional da Via
// Minas Transportes — mesma identidade visual do site (viaminastransportes,
// vermelho #E30613 / azul-marinho #061A3A) — com o acesso ao sistema
// embutido direto no Hero, em vez de uma tela de login isolada e sem
// contexto. Um possível cliente/parceiro que cai aqui já entende quem é a
// empresa, sua estrutura e como funciona o controle de viagens antes de
// rolar a tela; quem já tem conta loga sem sair da primeira dobra.
export function Login() {
    return (
        <div className="min-h-screen bg-[#F6F8FB] text-[#061A3A]">
            <Header />
            <Hero />
            <StatsSection />
            <AboutSection />
            <TrackingSection />
            <FleetSection />
            <ContactFooter />
        </div>
    );
}

const navLinks = [
    { label: 'Estrutura', href: '#estrutura' },
    { label: 'Controle de viagens', href: '#controle-viagens' },
    { label: 'Frota', href: '#frota' },
    { label: 'Contato', href: '#contato' },
];

function Header() {
    const [isOpen, setIsOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        function handleScroll() {
            setScrolled(window.scrollY > 24);
        }

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <header
            className={`fixed left-0 top-0 z-50 w-full transition-all duration-300 ${scrolled
                ? 'border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-xl'
                : 'bg-transparent'
                }`}
        >
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                <a href="#" className="flex items-center gap-2.5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#061A3A]">
                        <Truck size={22} className="text-white" />
                    </div>
                    <div className="leading-tight">
                        <p className="text-lg font-black tracking-tight text-[#061A3A]">
                            Via Minas
                        </p>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#E30613]">
                            Transportes
                        </p>
                    </div>
                </a>

                <nav className="hidden items-center gap-9 md:flex">
                    {navLinks.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            className="text-sm font-semibold text-[#061A3A] transition hover:text-[#E30613]"
                        >
                            {link.label}
                        </a>
                    ))}
                </nav>

                <a
                    href="#acesso"
                    className="hidden rounded-xl bg-[#E30613] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-600/20 transition hover:bg-[#B9000B] sm:inline-flex"
                >
                    Entrar
                </a>

                <button
                    type="button"
                    onClick={() => setIsOpen((v) => !v)}
                    className="inline-flex rounded-xl border border-slate-300 p-2 text-[#061A3A] md:hidden"
                >
                    {isOpen ? <X size={22} /> : <Menu size={22} />}
                </button>
            </div>

            {isOpen && (
                <div className="border-t border-slate-200 bg-white px-6 py-5 md:hidden">
                    <nav className="flex flex-col gap-3">
                        {navLinks.map((link) => (
                            <a
                                key={link.href}
                                href={link.href}
                                onClick={() => setIsOpen(false)}
                                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-[#061A3A] hover:border-[#E30613] hover:text-[#E30613]"
                            >
                                {link.label}
                            </a>
                        ))}

                        <a
                            href="#acesso"
                            onClick={() => setIsOpen(false)}
                            className="rounded-2xl bg-[#E30613] px-4 py-3 text-center font-black text-white"
                        >
                            Entrar
                        </a>
                    </nav>
                </div>
            )}
        </header>
    );
}

function Hero() {
    return (
        <section className="relative overflow-hidden bg-white px-6 pb-24 pt-32">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(227,6,19,0.06),transparent_35%)]" />

            <div className="relative mx-auto grid max-w-7xl items-start gap-16 lg:grid-cols-[1fr_0.85fr]">
                <div>
                    <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#E30613]/20 bg-white px-4 py-2 text-sm font-medium text-[#061A3A] shadow-sm">
                        <Truck size={16} className="text-[#E30613]" />
                        Transporte com responsabilidade e atendimento próximo
                    </div>

                    <h1 className="max-w-xl text-4xl font-black leading-[1.08] tracking-tight text-[#061A3A] md:text-6xl">
                        Sua carga acompanhada{' '}
                        <span className="text-[#E30613]">do início ao fim.</span>
                    </h1>

                    <p className="mt-6 max-w-lg text-lg leading-8 text-slate-600">
                        A Via Minas Transportes opera com estrutura própria,
                        comunicação direta e controle de cada viagem — da coleta
                        até a entrega.
                    </p>

                    <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                        <a
                            href="#estrutura"
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-6 py-3.5 font-bold text-[#061A3A] transition hover:border-[#E30613] hover:text-[#E30613]"
                        >
                            Conhecer a estrutura
                            <ArrowRight size={18} />
                        </a>
                    </div>

                    <div className="mt-12 grid gap-4 sm:grid-cols-2">
                        <HeroPoint
                            icon={<Route size={18} />}
                            title="Controle de viagens"
                            description="Cada trajeto acompanhado do início ao fim."
                        />
                        <HeroPoint
                            icon={<ShieldCheck size={18} />}
                            title="Frota própria"
                            description="Estrutura preparada pra operar com segurança."
                        />
                    </div>
                </div>

                <LoginCard />
            </div>
        </section>
    );
}

function HeroPoint({
    icon,
    title,
    description,
}: {
    icon: ReactNode;
    title: string;
    description: string;
}) {
    return (
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E30613]/10 text-[#E30613]">
                {icon}
            </div>
            <div>
                <h3 className="font-black text-[#061A3A]">{title}</h3>
                <p className="mt-0.5 text-sm leading-5 text-slate-600">
                    {description}
                </p>
            </div>
        </div>
    );
}

// Card de acesso embutido no Hero — é o pedido explícito: a tela inicial
// tem cara de site institucional, mas o login continua na primeira dobra,
// sem precisar de uma rota separada.
function LoginCard() {
    const { entrar } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [mostrarSenha, setMostrarSenha] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setErro(null);
        setEnviando(true);

        try {
            await entrar(email.trim(), senha);
            navigate('/', { replace: true });
        } catch (err: any) {
            setErro(
                err?.response?.data?.message ?? 'Não foi possível entrar. Tente de novo.',
            );
        } finally {
            setEnviando(false);
        }
    }

    return (
        <motion.div
            id="acesso"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="scroll-mt-28 rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl"
        >
            <p className="text-sm font-black uppercase tracking-[0.25em] text-[#E30613]">
                Área do parceiro
            </p>
            <h2 className="mt-2 text-2xl font-black text-[#061A3A]">
                Acesse o sistema
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
                Entre com sua conta pra acompanhar frota, viagens e operação em
                tempo real.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                        E-mail
                    </label>
                    <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 transition focus-within:ring-2 focus-within:ring-[#E30613]/30">
                        <Mail size={16} className="shrink-0 text-slate-400" />
                        <input
                            type="email"
                            required
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="seu@email.com"
                            className="w-full bg-transparent text-sm text-[#061A3A] outline-none placeholder:text-slate-400"
                        />
                    </div>
                </div>

                <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                        Senha
                    </label>
                    <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 transition focus-within:ring-2 focus-within:ring-[#E30613]/30">
                        <Lock size={16} className="shrink-0 text-slate-400" />
                        <input
                            type={mostrarSenha ? 'text' : 'password'}
                            required
                            autoComplete="current-password"
                            value={senha}
                            onChange={(e) => setSenha(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-transparent text-sm text-[#061A3A] outline-none placeholder:text-slate-400"
                        />
                        <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => setMostrarSenha((v) => !v)}
                            className="shrink-0 text-slate-400 hover:text-slate-600"
                        >
                            {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                </div>

                {erro && (
                    <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-[#E30613]">
                        {erro}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={enviando}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#E30613] py-3 font-black text-white shadow-lg shadow-red-600/20 transition hover:bg-[#B9000B] disabled:opacity-60"
                >
                    {enviando && <LoaderCircle size={16} className="animate-spin" />}
                    Entrar
                </button>
            </form>

            <p className="mt-4 text-center text-xs text-slate-400">
                Acesso restrito à equipe e parceiros autorizados da Via Minas
                Transportes.
            </p>
        </motion.div>
    );
}

function StatsSection() {
    return (
        <section className="bg-[#F6F8FB] px-6 py-10">
            <div className="mx-auto grid max-w-7xl gap-4 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
                <StatCard number="Frota" label="Estrutura própria" />
                <StatCard number="MG" label="Base em Minas Gerais" />
                <StatCard number="Tempo real" label="Rastreamento da operação" />
                <StatCard number="Direto" label="Contato com a operação" />
            </div>
        </section>
    );
}

function StatCard({ number, label }: { number: string; label: string }) {
    return (
        <div className="flex items-center gap-4 rounded-3xl bg-white p-5">
            <div className="text-2xl font-black text-[#061A3A]">{number}</div>
            <div className="text-sm font-medium text-slate-500">{label}</div>
        </div>
    );
}

function AboutSection() {
    return (
        <section id="estrutura" className="scroll-mt-20 bg-white px-6 py-24">
            <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[0.9fr_1.1fr]">
                <div>
                    <p className="mb-3 text-sm font-black uppercase tracking-[0.3em] text-[#E30613]">
                        Estrutura da empresa
                    </p>

                    <h2 className="text-4xl font-black tracking-tight text-[#061A3A] md:text-5xl">
                        Uma operação organizada por trás de cada viagem.
                    </h2>

                    <p className="mt-6 text-lg leading-8 text-slate-600">
                        A Via Minas Transportes mantém frota própria, equipe
                        dedicada e uma operação estruturada pra acompanhar cada
                        etapa do transporte — do planejamento da rota até a
                        confirmação da entrega.
                    </p>

                    <p className="mt-4 text-lg leading-8 text-slate-600">
                        Essa mesma estrutura alimenta o sistema de controle de
                        viagens usado internamente pela equipe, o que garante
                        informação atualizada e confiável em cada operação.
                    </p>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                    <AboutCard
                        title="Frota própria"
                        description="Veículos preparados pra atender operações sob demanda e recorrentes."
                    />
                    <AboutCard
                        title="Equipe dedicada"
                        description="Time acompanhando a operação do início ao fim de cada viagem."
                    />
                    <AboutCard
                        title="Base em Minas Gerais"
                        description="Estrutura própria com atuação regional consolidada."
                    />
                    <AboutCard
                        title="Operação estruturada"
                        description="Processos organizados pra garantir segurança e pontualidade."
                    />
                </div>
            </div>
        </section>
    );
}

function AboutCard({
    title,
    description,
}: {
    title: string;
    description: string;
}) {
    return (
        <div className="rounded-3xl border border-slate-200 bg-[#F6F8FB] p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#061A3A] text-white">
                <CheckCircle2 size={20} />
            </div>
            <h3 className="font-black text-[#061A3A]">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
                {description}
            </p>
        </div>
    );
}

function TrackingSection() {
    return (
        <section
            id="controle-viagens"
            className="scroll-mt-20 bg-[#F6F8FB] px-6 py-24"
        >
            <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
                <div>
                    <p className="mb-3 text-sm font-black uppercase tracking-[0.3em] text-[#E30613]">
                        Controle de viagens
                    </p>

                    <h2 className="text-4xl font-black tracking-tight text-[#061A3A] md:text-5xl">
                        Cada viagem, do início ao fim, sob controle.
                    </h2>

                    <p className="mt-5 text-lg leading-8 text-slate-600">
                        O sistema interno da Via Minas acompanha a frota em tempo
                        real: identifica quando uma viagem começa, segue o
                        trajeto e confirma a chegada — com histórico completo por
                        veículo.
                    </p>

                    <div className="mt-8 space-y-4">
                        <TrackingItem
                            icon={<Route />}
                            title="Rastreamento em tempo real"
                            description="Localização da frota atualizada automaticamente durante a operação."
                        />
                        <TrackingItem
                            icon={<PackageCheck />}
                            title="Viagens identificadas por GPS"
                            description="Início e fim de cada viagem detectados a partir da posição do veículo."
                        />
                        <TrackingItem
                            icon={<CheckCircle2 />}
                            title="Histórico por veículo"
                            description="Contagem de viagens concluídas e em andamento por placa."
                        />
                    </div>
                </div>

                <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl">
                    <div className="rounded-[1.5rem] border border-slate-200 bg-[#061A3A] p-6 text-white">
                        <div className="flex items-center justify-between border-b border-white/10 pb-5">
                            <div>
                                <p className="text-sm text-white/60">
                                    Resumo da operação
                                </p>
                                <h3 className="text-2xl font-black">
                                    Frota em operação
                                </h3>
                            </div>

                            <div className="rounded-full bg-[#E30613] px-4 py-2 text-sm font-bold text-white">
                                Ao vivo
                            </div>
                        </div>

                        <div className="mt-8 space-y-4">
                            <OperationStep title="Origem" value="Santos - SP" />
                            <OperationStep title="Destino" value="Minas Gerais" />
                            <OperationStep title="Status" value="Em andamento" />
                            <OperationStep title="Viagens concluídas" value="No mês" />
                        </div>

                        <div className="mt-6 rounded-3xl border border-white/10 bg-white/10 p-5">
                            <p className="text-sm text-white/60">
                                Acompanhamento
                            </p>
                            <p className="mt-2 leading-7 text-white/80">
                                Informação objetiva sobre cada etapa da viagem,
                                direto pra equipe responsável pela operação.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function TrackingItem({
    icon,
    title,
    description,
}: {
    icon: ReactNode;
    title: string;
    description: string;
}) {
    return (
        <div className="flex gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E30613]/10 text-[#E30613]">
                {icon}
            </div>
            <div>
                <h3 className="font-black text-[#061A3A]">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                    {description}
                </p>
            </div>
        </div>
    );
}

function OperationStep({ title, value }: { title: string; value: string }) {
    return (
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 p-4">
            <p className="text-sm text-white/60">{title}</p>
            <p className="font-bold text-white">{value}</p>
        </div>
    );
}

function FleetSection() {
    return (
        <section id="frota" className="scroll-mt-20 bg-white px-6 py-24">
            <div className="mx-auto max-w-7xl">
                <p className="mb-3 text-sm font-black uppercase tracking-[0.3em] text-[#E30613]">
                    Nossa frota
                </p>
                <h2 className="max-w-2xl text-4xl font-black tracking-tight text-[#061A3A] md:text-5xl">
                    Estrutura preparada pra entregar com segurança.
                </h2>

                <div className="mt-10 grid gap-5 lg:grid-cols-3">
                    <FleetFeature
                        icon={<Truck />}
                        title="Frota própria"
                        description="Veículos preparados pra atender operações sob demanda e recorrentes."
                    />
                    <FleetFeature
                        icon={<Route />}
                        title="Operação acompanhada"
                        description="Comunicação direta durante o transporte, da coleta até a entrega."
                    />
                    <FleetFeature
                        icon={<ShieldCheck />}
                        title="Cuidado com a carga"
                        description="Foco em segurança, conservação e pontualidade em cada viagem."
                    />
                </div>
            </div>
        </section>
    );
}

function FleetFeature({
    icon,
    title,
    description,
}: {
    icon: ReactNode;
    title: string;
    description: string;
}) {
    return (
        <div className="group h-full rounded-3xl border border-slate-200 bg-white p-7 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#E30613]/40 hover:shadow-xl">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E30613]/10 text-[#E30613] transition group-hover:bg-[#E30613] group-hover:text-white">
                {icon}
            </div>
            <h3 className="text-xl font-black text-[#061A3A]">{title}</h3>
            <p className="mt-4 leading-7 text-slate-600">{description}</p>
        </div>
    );
}

function ContactFooter() {
    return (
        <>
            <section id="contato" className="bg-[#061A3A] px-6 py-20 text-white">
                <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
                    <div>
                        <p className="mb-3 text-sm font-black uppercase tracking-[0.3em] text-[#E30613]">
                            Contato
                        </p>
                        <h2 className="text-4xl font-black tracking-tight md:text-5xl">
                            Fale com a Via Minas.
                        </h2>
                        <p className="mt-5 max-w-xl text-lg leading-8 text-white/75">
                            Solicite uma cotação, tire dúvidas ou fale direto com
                            a nossa equipe.
                        </p>

                        <a
                            href="https://wa.me/553191384734"
                            target="_blank"
                            rel="noreferrer"
                            className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-[#E30613] px-6 py-3.5 font-black text-white shadow-lg shadow-red-600/20 transition hover:bg-[#B9000B]"
                        >
                            Chamar no WhatsApp
                            <ArrowRight size={18} />
                        </a>
                    </div>

                    <div className="rounded-[2rem] bg-white/5 p-6">
                        <a
                            href="#acesso"
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 px-6 py-4 font-black text-white transition hover:border-white/40"
                        >
                            Já sou parceiro — quero entrar
                        </a>
                        <p className="mt-4 text-center text-sm text-white/50">
                            Acesso à área restrita da equipe e parceiros.
                        </p>
                    </div>
                </div>
            </section>

            <footer className="bg-white px-6 py-10">
                <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-slate-200 pt-8 text-sm text-slate-500 sm:flex-row">
                    <p>
                        © {new Date().getFullYear()} Via Minas Transportes. Todos
                        os direitos reservados.
                    </p>

                    <div className="flex items-center gap-2">
                        <Clock size={14} />
                        <span>Sistema de controle de viagens</span>
                    </div>
                </div>
            </footer>
        </>
    );
}
