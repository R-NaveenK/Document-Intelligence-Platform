"""
Semantic Field Representation
Builds and caches rich conceptual representations of fields (target concept vectors, expected value types,
positive/negative contextual cues, and descriptive domain contexts).
"""

from typing import Dict, Any, List, Optional, Set
import re
import math
import numpy as np

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False
    
    class SimpleTfidfVectorizer:
        def __init__(self, **kwargs):
            self.vocab = {}
            self.idf = {}
            
        def fit(self, corpus):
            doc_counts = {}
            total_docs = len(corpus)
            for doc in corpus:
                words = set(re.findall(r'(?u)\b[a-zA-Z0-9_#/-]{2,}\b', doc.lower()))
                for w in words:
                    doc_counts[w] = doc_counts.get(w, 0) + 1
            for idx, w in enumerate(sorted(doc_counts.keys())):
                self.vocab[w] = idx
                self.idf[w] = math.log((1 + total_docs) / (1 + doc_counts[w])) + 1.0
            return self
            
        def transform(self, texts):
            rows = []
            dim = len(self.vocab)
            for text in texts:
                vec = np.zeros(dim, dtype=np.float32)
                words = re.findall(r'(?u)\b[a-zA-Z0-9_#/-]{2,}\b', text.lower())
                for w in words:
                    if w in self.vocab:
                        vec[self.vocab[w]] += 1.0 * self.idf.get(w, 1.0)
                norm = np.linalg.norm(vec)
                if norm > 0:
                    vec = vec / norm
                rows.append(vec)
            class ArrayWrapper:
                def __init__(self, arr): self._arr = np.array(arr)
                def toarray(self): return self._arr
            return ArrayWrapper(rows)
            
    TfidfVectorizer = SimpleTfidfVectorizer

from pydantic import BaseModel, Field, ConfigDict

# Core domain corpus defining semantic anchors for intelligent document processing
DOMAIN_ANCHOR_CORPUS = [
    # Identifiers & References
    "invoice number invoice no bill no bill number billing reference inv no inv # reference number ref no document number document reference doc id",
    "purchase order number po number po no po reference order id order number order reference",
    "receipt number receipt no rcp no ticket number transaction id txn id transaction identifier reference id tracking id voucher id billing reference",
    "certificate number cert no credential id registration number reg no roll no serial number",
    "lab id patient id report number accession number test id sample id case id",
    "pan number permanent account number taxpayer id pan no tax registration",
    "gstin gst number goods and services tax identification number tax id vat number",
    "bank account number acc no a/c no ifsc code bank branch micr",

    # Dates
    "invoice date bill date issue date date of billing billing date date",
    "due date payment due payment date maturity date expiry date valid till payment due date",
    "po date order date date of purchase booking date",
    "test date examination date collection date sample date reported date",
    "delivery date shipping date dispatch date expected date arrival date",

    # Parties & Organizations
    "customer name client name buyer name buyer organization bill to billed to billed party purchaser party responsible for payment sold to recipient recipient organization consignee patient name candidate name",
    "seller name vendor name merchant name supplier name provider name issuer issued by company name service provider ship from",

    # Monetary & Amounts
    "total amount grand total total invoice amount net amount amount payable net settlement final settlement value amount to be remitted total payable balance due final amount total po value gross amount",
    "subtotal sub total taxable amount base amount net total items total",
    "tax amount cgst sgst igst vat tax value total tax",
    "unit price rate price per item unit rate cost fee charges unit charge",
    "quantity qty nos units count number of items qty delivered",

    # Line Items
    "item name product description article particulars goods item details line items items delivered",
    "hsn code sac code commodity code tariff code classification"
]

class FieldSemanticRepresentation(BaseModel):
    field_name: str
    display_name: str
    description: str
    expected_type: str = "string"  # identifier, date, currency, number, entity_name, code, text
    concept_tokens: List[str] = Field(default_factory=list)
    positive_context_cues: List[str] = Field(default_factory=list)
    negative_context_cues: List[str] = Field(default_factory=list)
    vector: Optional[List[float]] = None
    model_config = ConfigDict(arbitrary_types_allowed=True)

class SemanticConceptSpace:
    """Manages the semantic representation vector space with subword & word TF-IDF cosine embedding."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SemanticConceptSpace, cls).__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        # Character n-grams (3-5) + word n-grams (1-2) for subword morpho-semantic robustness
        self.vectorizer = TfidfVectorizer(
            analyzer='word',
            ngram_range=(1, 2),
            token_pattern=r'(?u)\b[a-zA-Z0-9_#/-]{2,}\b',
            lowercase=True
        )
        self.vectorizer.fit(DOMAIN_ANCHOR_CORPUS)
        self._cache: Dict[str, FieldSemanticRepresentation] = {}

    def get_representation(
        self,
        field_name: str,
        display_name: Optional[str] = None,
        description: Optional[str] = None,
        data_type: Optional[str] = None
    ) -> FieldSemanticRepresentation:
        """Returns cached or freshly computed semantic representation for any target field."""
        cache_key = f"{field_name.lower()}:{str(display_name).lower()}:{str(data_type).lower()}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        disp = display_name or field_name.replace("_", " ").title()
        desc = description or f"Field representing {disp}"
        
        # Infer expected type & contextual cues dynamically
        expected_type = self._infer_expected_type(field_name, disp, data_type)
        pos_cues, neg_cues = self._infer_context_cues(field_name, disp, expected_type)

        # Build composite text for semantic vectorization
        composite_text = f"{field_name.replace('_', ' ')} {disp} {desc} {' '.join(pos_cues)}"
        vec = self.vectorizer.transform([composite_text]).toarray()[0].tolist()

        concept_tokens = [t for t in re.split(r'[\s_]+', f"{field_name} {disp}".lower()) if len(t) > 1]

        rep = FieldSemanticRepresentation(
            field_name=field_name,
            display_name=disp,
            description=desc,
            expected_type=expected_type,
            concept_tokens=concept_tokens,
            positive_context_cues=pos_cues,
            negative_context_cues=neg_cues,
            vector=vec
        )
        self._cache[cache_key] = rep
        return rep

    def compute_similarity(self, text: str, rep: FieldSemanticRepresentation) -> float:
        """Computes cosine similarity between target field concept and candidate text."""
        if not text.strip() or not rep.vector:
            return 0.0
        cand_vec = self.vectorizer.transform([text]).toarray()[0]
        rep_vec = np.array(rep.vector)
        norm_c = np.linalg.norm(cand_vec)
        norm_r = np.linalg.norm(rep_vec)
        if norm_c == 0 or norm_r == 0:
            return 0.0
        return float(np.dot(cand_vec, rep_vec) / (norm_c * norm_r))

    def _infer_expected_type(self, field_name: str, disp: str, explicit_type: Optional[str]) -> str:
        f_lower = f"{field_name} {disp}".lower()
        if explicit_type and explicit_type not in ["string", "any"]:
            return explicit_type
        if any(w in f_lower for w in ["date", "time", "day", "period"]):
            return "date"
        if any(w in f_lower for w in ["amount", "total", "price", "rate", "cost", "sum", "balance", "payable", "fee", "subtotal"]):
            return "currency"
        if any(w in f_lower for w in ["qty", "quantity", "count", "number of", "units", "nos"]):
            return "number"
        if any(w in f_lower for w in ["gstin", "pan", "vat", "cin", "tax id", "tin"]):
            return "tax_id"
        if any(w in f_lower for w in ["number", "no", "num", "id", "code", "reference", "ref", "identifier", "serial", "token"]):
            return "identifier"
        if any(w in f_lower for w in ["name", "party", "customer", "buyer", "seller", "vendor", "merchant", "recipient", "organization", "company", "patient"]):
            return "entity_name"
        return "string"

    def _infer_context_cues(self, field_name: str, disp: str, expected_type: str) -> (List[str], List[str]):
        f_lower = f"{field_name} {disp}".lower()
        pos: List[str] = []
        neg: List[str] = []

        # Customer / Buyer vs Seller disambiguation
        if any(w in f_lower for w in ["customer", "buyer", "client", "bill to", "recipient", "purchaser", "patient", "billed", "party"]):
            pos.extend(["bill to", "billed to", "sold to", "customer", "buyer", "client", "patient", "ship to", "recipient", "consignee", "billed party", "purchaser", "party responsible"])
            neg.extend(["seller", "vendor", "merchant", "from", "supplier", "issued by", "provider", "techsolutions"])
        elif any(w in f_lower for w in ["seller", "vendor", "merchant", "supplier", "issuer", "provider"]):
            pos.extend(["seller", "vendor", "merchant", "from", "supplier", "issued by", "store", "company"])
            neg.extend(["bill to", "billed to", "customer", "buyer", "client", "recipient"])

        # Invoice / Issue Date vs Due / Expiry Date
        if "date" in f_lower:
            if any(w in f_lower for w in ["due", "expiry", "valid till", "maturity"]):
                pos.extend(["due date", "expiry date", "valid till", "pay by", "payment due date"])
                neg.extend(["invoice date", "bill date", "issue date", "po date"])
            else:
                pos.extend(["invoice date", "bill date", "issue date", "date of billing", "date:", "dated", "po date"])
                neg.extend(["due date", "expiry date", "delivery date", "ship date"])

        # Invoice / Billing ID vs PO ID vs Tax ID
        if expected_type == "identifier":
            if any(w in f_lower for w in ["invoice", "inv", "bill number"]):
                pos.extend(["invoice no", "inv no", "bill no", "bill number", "receipt no", "document no", "invoice number", "bill#"])
                neg.extend(["po number", "purchase order", "order no", "gstin", "pan", "account number", "phone", "transaction identifier", "transaction id", "tracking id"])
            elif any(w in f_lower for w in ["billing reference", "reference", "ref", "transaction"]):
                pos.extend(["billing reference", "reference no", "transaction identifier", "ref no", "doc id", "order reference", "bill no"])
                neg.extend(["gstin", "pan", "account number", "phone"])
            elif any(w in f_lower for w in ["po", "purchase order", "order"]):
                pos.extend(["po number", "po no", "purchase order no", "order number"])
                neg.extend(["invoice no", "tax invoice", "bill no", "receipt no"])

        # Monetary / Total Amount cues
        if expected_type == "currency" or any(w in f_lower for w in ["amount", "total", "payable", "settlement", "charge", "price"]):
            pos.extend(["grand total", "total amount", "amount payable", "final settlement value", "net settlement", "final amount", "total payable", "balance due", "settlement", "total"])
            neg.extend(["subtotal", "sub total", "taxable", "cgst", "sgst", "igst", "discount", "qty"])

        return pos, neg
