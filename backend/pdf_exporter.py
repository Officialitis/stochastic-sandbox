from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                 TableStyle, HRFlowable, Image as RLImage)
from reportlab.lib.enums import TA_CENTER, TA_LEFT
import io, datetime, base64
from PIL import Image as PILImage

ACCENT       = colors.HexColor('#4f46e5')
ACCENT_LIGHT = colors.HexColor('#eef2ff')
DARK_TEXT    = colors.HexColor('#0f172a')
MED_TEXT     = colors.HexColor('#334155')
MUTED        = colors.HexColor('#64748b')
BORDER       = colors.HexColor('#e2e8f0')
SUCCESS      = colors.HexColor('#059669')
SUCCESS_BG   = colors.HexColor('#ecfdf5')

# ── Model Parameter Definitions ──────────────────────────────────────────────
PARAM_DEFINITIONS = {
    "Brownian Motion": {
        "μ": "Drift coefficient — constant rate of deterministic growth per unit time.",
        "σ": "Volatility coefficient — amplitude of random Gaussian fluctuations.",
        "X₀": "Initial value of the process at t = 0.",
        "T": "Time horizon — total simulation duration in years.",
        "N Steps": "Number of discrete time steps in the simulation.",
        "N Paths": "Number of independently simulated Monte Carlo paths.",
    },
    "Geometric BM": {
        "μ": "Expected return (drift) — annualised proportional growth rate.",
        "σ": "Volatility — annualised proportional standard deviation (log-return vol).",
        "X₀": "Initial asset price S₀.",
        "T": "Time horizon in years.",
        "N Steps": "Number of discrete time steps (252 = daily over 1 year).",
        "N Paths": "Number of Monte Carlo price trajectories.",
    },
    "Ornstein–Uhlenbeck": {
        "θ": "Speed of mean reversion — rate at which the process reverts to its long-run mean.",
        "μ": "Long-run mean (equilibrium level) of the process.",
        "σ": "Volatility of the diffusion term.",
        "X₀": "Initial value of the process.",
        "T": "Simulation time horizon in years.",
        "N Steps": "Number of discrete time steps.",
        "N Paths": "Number of Monte Carlo paths.",
    },
    "Cox–Ingersoll–Ross": {
        "a": "Speed of mean reversion κ in dr = a(b−r)dt + σ√r dW.",
        "b": "Long-run mean interest rate level.",
        "σ": "Volatility — must satisfy Feller condition 2ab > σ² to stay positive.",
        "X₀": "Initial short rate r₀.",
        "T": "Simulation time horizon in years.",
        "N Steps": "Number of time steps.",
        "N Paths": "Number of Monte Carlo paths.",
    },
    "Heston": {
        "μ": "Drift of the asset price process S.",
        "κ": "Speed of mean reversion of variance to its long-run level θ.",
        "θ": "Long-run variance level (vol² at steady state).",
        "ξ": "Vol of vol — volatility of the variance process.",
        "ρ": "Correlation between dWˢ and dWᵛ — typically negative (leverage effect).",
        "v₀": "Initial variance at t = 0.",
        "X₀": "Initial asset price S₀.",
        "T": "Time horizon in years.",
        "N Steps": "Number of time steps.",
        "N Paths": "Number of Monte Carlo paths.",
    },
    "Custom SDE": {
        "Drift μ(t,x)": "User-defined drift function parsed symbolically via SymPy.",
        "Volatility σ(t,x)": "User-defined diffusion function parsed symbolically via SymPy.",
        "Scheme": "Euler-Maruyama or Milstein discretization scheme.",
        "X₀": "Initial condition.",
        "T": "Simulation horizon.",
        "N Steps": "Number of time steps.",
        "N Paths": "Number of Monte Carlo paths.",
    },
}


def _b64_image_to_reportlab(b64str: str, max_width_cm: float = 15.0) -> RLImage | None:
    """Decode a base64 PNG and return a proportionally sized ReportLab Image flowable."""
    try:
        raw = base64.b64decode(b64str)
        buf = io.BytesIO(raw)
        pil_img = PILImage.open(buf)
        w, h = pil_img.size
        target_w = max_width_cm * cm
        target_h = target_w * (h / max(1, w))
        buf.seek(0)
        img = RLImage(buf, width=target_w, height=target_h)
        img.hAlign = "CENTER"
        return img
    except Exception:
        return None


def generate_pdf_report(payload: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm,
        topMargin=2.5*cm, bottomMargin=2*cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'Title', parent=styles['Title'],
        fontSize=22, textColor=ACCENT, alignment=TA_CENTER,
        spaceAfter=4, fontName='Helvetica-Bold',
    )
    subtitle_style = ParagraphStyle(
        'Subtitle', parent=styles['Normal'],
        fontSize=10, textColor=MUTED, alignment=TA_CENTER,
        spaceAfter=16,
    )
    h2_style = ParagraphStyle(
        'H2', parent=styles['Heading2'],
        fontSize=13, textColor=ACCENT,
        fontName='Helvetica-Bold', spaceAfter=6, spaceBefore=14,
    )
    h3_style = ParagraphStyle(
        'H3', parent=styles['Heading3'],
        fontSize=11, textColor=MED_TEXT,
        fontName='Helvetica-Bold', spaceAfter=4, spaceBefore=8,
    )
    body_style = ParagraphStyle(
        'Body', parent=styles['Normal'],
        fontSize=10, textColor=DARK_TEXT, leading=16,
    )
    def_key_style = ParagraphStyle(
        'DefKey', parent=styles['Normal'],
        fontSize=9, textColor=ACCENT,
        fontName='Helvetica-Bold', leading=13,
    )
    def_val_style = ParagraphStyle(
        'DefVal', parent=styles['Normal'],
        fontSize=9, textColor=MED_TEXT, leading=13, leftIndent=10,
    )
    mono_style = ParagraphStyle(
        'Mono', parent=styles['Code'],
        fontSize=9, textColor=colors.HexColor('#1e293b'),
        backColor=ACCENT_LIGHT, leading=14,
        leftIndent=10, rightIndent=10,
    )
    caption_style = ParagraphStyle(
        'Caption', parent=styles['Normal'],
        fontSize=8, textColor=MUTED, alignment=TA_CENTER, spaceBefore=2, spaceAfter=8,
    )

    story = []

    # ── Header ──────────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph("Stochastic Sandbox", title_style))
    story.append(Paragraph(
        f"Simulation Report &mdash; Generated {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        subtitle_style,
    ))
    story.append(HRFlowable(width='100%', thickness=2, color=ACCENT, spaceAfter=10))

    # ── 1. Model & Configuration ─────────────────────────────────────────────
    model = payload.get('model', 'Unknown')
    story.append(Paragraph("1. Model &amp; Configuration", h2_style))
    story.append(Paragraph(f"<b>Selected Model:</b> {model}", body_style))
    story.append(Spacer(1, 4))

    params = payload.get('params', {})
    if params:
        param_rows = [['Parameter', 'Value']]
        for k, v in params.items():
            param_rows.append([str(k), str(v)])
        tbl = Table(param_rows, colWidths=[8*cm, 8*cm])
        tbl.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), ACCENT),
            ('TEXTCOLOR',  (0,0), (-1,0), colors.white),
            ('FONTNAME',   (0,0), (-1,0), 'Helvetica-Bold'),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
            ('GRID', (0,0), (-1,-1), 0.5, BORDER),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ]))
        story.append(tbl)

    # ── 2. Parameter Definitions ─────────────────────────────────────────────
    definitions = PARAM_DEFINITIONS.get(model, {})
    if definitions:
        story.append(Spacer(1, 0.4*cm))
        story.append(Paragraph("2. Parameter Definitions", h2_style))
        for param_name, definition in definitions.items():
            story.append(Paragraph(param_name, def_key_style))
            story.append(Paragraph(definition, def_val_style))
        story.append(Spacer(1, 0.2*cm))

    # ── 3. Simulation Charts ─────────────────────────────────────────────────
    charts = payload.get('charts', {})
    chart_section_num = 3
    if charts:
        story.append(Paragraph(f"{chart_section_num}. Simulation Charts", h2_style))
        chart_labels = {
            "paths": ("Monte Carlo Paths", "Simulated price/value trajectories with percentile bands (5–95th and 25–75th) and median."),
            "hist":  ("Terminal Value Distribution", "Empirical histogram of terminal values X(T) with optional theoretical PDF overlay."),
        }
        for key, b64 in charts.items():
            label, caption = chart_labels.get(key, (key, ""))
            story.append(Paragraph(label, h3_style))
            img = _b64_image_to_reportlab(b64)
            if img:
                story.append(img)
            story.append(Paragraph(caption, caption_style))
        chart_section_num += 1

    # ── 4. Empirical vs. Theoretical Statistics ──────────────────────────────
    stats = payload.get('stats', {})
    theoretical = payload.get('theoretical', {})
    if stats:
        story.append(Paragraph(f"{chart_section_num}. Empirical vs. Theoretical Statistics", h2_style))
        stat_rows = [['Statistic', 'Empirical', 'Theoretical']]
        stat_keys = ['mean', 'std', 'median', 'skewness', 'kurtosis', 'p5', 'p95', 'min', 'max']
        for k in stat_keys:
            emp  = f"{stats.get(k, 'N/A'):.6f}" if isinstance(stats.get(k), (int, float)) else 'N/A'
            theo = f"{theoretical.get(k, 'N/A'):.6f}" if isinstance(theoretical.get(k), (int, float)) else '—'
            stat_rows.append([k.replace('_', ' ').title(), emp, theo])
        tbl2 = Table(stat_rows, colWidths=[5.3*cm, 5.3*cm, 5.3*cm])
        tbl2.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), ACCENT),
            ('TEXTCOLOR',  (0,0), (-1,0), colors.white),
            ('FONTNAME',   (0,0), (-1,0), 'Helvetica-Bold'),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
            ('GRID', (0,0), (-1,-1), 0.5, BORDER),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ]))
        story.append(tbl2)
        chart_section_num += 1

    # ── Custom SDE ────────────────────────────────────────────────────────────
    if model == 'Custom SDE':
        meta = payload.get('sde_meta', {})
        story.append(Paragraph(f"{chart_section_num}. Custom SDE Formulae (SymPy)", h2_style))
        story.append(Paragraph(f"Drift:         {meta.get('drift_parsed', '')}", mono_style))
        story.append(Paragraph(f"Volatility:    {meta.get('vol_parsed', '')}", mono_style))
        story.append(Paragraph(f"Vol Derivative (Milstein): {meta.get('vol_derivative', '')}", mono_style))
        story.append(Spacer(1, 6))

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(HRFlowable(width='100%', thickness=1, color=BORDER, spaceBefore=16, spaceAfter=6))
    story.append(Paragraph(
        "Stochastic Sandbox &nbsp;|&nbsp; Academic Simulation Report &nbsp;|&nbsp; For educational purposes only.",
        ParagraphStyle('footer', parent=styles['Normal'], fontSize=8, textColor=MUTED, alignment=TA_CENTER),
    ))

    doc.build(story)
    buf.seek(0)
    return buf.read()
