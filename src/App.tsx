import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, ChevronRight } from 'lucide-react';

// Telegram WebApp type declaration
declare global {
  interface Window {
    Telegram: {
      WebApp: {
        expand: () => void;
        close: () => void;
        sendData: (data: string) => void;
        themeParams: {
          bg_color?: string;
          text_color?: string;
          hint_color?: string;
          link_color?: string;
          button_color?: string;
          button_text_color?: string;
          secondary_bg_color?: string;
        };
        BackButton: {
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
        };
      };
    };
  }
}

interface Product {
  sku: string;
  name: string;
  price: number;
  image_url: string;
  category: string;
}

interface Variant {
  variantSku: string;
  variantKey: string;
  price: number;
  image_url: string;
}

interface SelectedVariant {
  variantSku: string;
  price: number;
  variantKey: string;
  parentSku: string;
}

const GROUP_NAMES: Record<string, string> = {
  CLOTHING: 'Одежда',
  ELECTRONICS: 'Электроника',
  HOME: 'Дом',
  KITCHEN: 'Кухня',
  JEWELRY: 'Бижутерия',
  LED_SPOTLIGHTS: 'Свет',
  Other: 'Прочее',
};

function shortenName(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.length > 5 ? words.slice(0, 5).join(' ') + '…' : name;
}

export default function App() {
  const tg = window.Telegram?.WebApp;
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [currentCategory, setCurrentCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalDescription, setModalDescription] = useState('');
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<SelectedVariant | null>(null);

  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const modalRef = useRef<HTMLDivElement>(null);

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Initialize Telegram WebApp
  useEffect(() => {
    if (tg) {
      tg.expand();
    }
  }, [tg]);

  // Load products
  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await fetch('/webapp/api/products');
      if (!resp.ok) throw new Error('Network error');
      const data = await resp.json();
      setAllProducts(data);
      setFilteredProducts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Search products
  const searchProducts = useCallback(async (query: string) => {
    try {
      setSearchLoading(true);
      const resp = await fetch(`/webapp/api/search?q=${encodeURIComponent(query)}`);
      if (!resp.ok) throw new Error('Network error');
      const data = await resp.json();
      setAllProducts(data);
      applyFilters(data, currentCategory);
    } catch (e) {
      console.error(e);
    } finally {
      setSearchLoading(false);
    }
  }, [currentCategory]);

  // Apply filters
  const applyFilters = useCallback((products: Product[], category: string) => {
    let result = products;
    if (category) {
      result = result.filter((p) => p.category === category);
    }
    setFilteredProducts(result);
  }, []);

  // Handle category change
  const handleCategoryChange = useCallback(
    (category: string) => {
      setCurrentCategory(category);
      applyFilters(allProducts, category);
    },
    [allProducts, applyFilters]
  );

  // Handle search with debounce
  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      if (value.length === 0) {
        loadProducts();
        return;
      }
      debounceTimer.current = setTimeout(() => {
        searchProducts(value);
      }, 300);
    },
    [loadProducts, searchProducts]
  );

  // Open product modal
  const openProduct = useCallback(async (product: Product) => {
    setSelectedProduct(product);
    setModalDescription('');
    setVariants([]);
    setSelectedVariant(null);
    setModalOpen(true);

    // Load description
    try {
      const descResp = await fetch(`/webapp/api/description/${product.sku}`);
      const descData = await descResp.json();
      setModalDescription(descData.description || 'Описание отсутствует.');
    } catch {
      setModalDescription('Не удалось загрузить описание.');
    }

    // Load variants
    setVariantsLoading(true);
    try {
      const varResp = await fetch(`/webapp/api/variants/${product.sku}`);
      const varData = await varResp.json();
      setVariants(varData);

      // If no variants, allow ordering parent product
      if (!varData.length) {
        setSelectedVariant({
          variantSku: product.sku,
          price: product.price,
          variantKey: 'Default',
          parentSku: product.sku,
        });
      }
    } catch {
      // Allow ordering parent product on error
      setSelectedVariant({
        variantSku: product.sku,
        price: product.price,
        variantKey: 'Default',
        parentSku: product.sku,
      });
    } finally {
      setVariantsLoading(false);
    }
  }, []);

  // Select variant
  const handleSelectVariant = useCallback((variant: Variant, parentSku: string) => {
    setSelectedVariant({
      variantSku: variant.variantSku,
      price: variant.price,
      variantKey: variant.variantKey,
      parentSku,
    });
  }, []);

  // Order product
  const orderProduct = useCallback(() => {
    if (!selectedVariant || !selectedProduct) return;

    const orderData = {
      action: 'web_order',
      sku: selectedVariant.variantSku,
      name: selectedProduct.name + ' (' + selectedVariant.variantKey + ')',
      price: selectedVariant.price,
    };

    if (tg) {
      tg.sendData(JSON.stringify(orderData));
      tg.close();
    }
  }, [selectedVariant, selectedProduct, tg]);

  // Close modal
  const closeModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  // Handle image load
  const handleImageLoad = useCallback((sku: string) => {
    setLoadedImages((prev) => new Set(prev).add(sku));
  }, []);

  // Get unique categories
  const categories = [...new Set(allProducts.map((p) => p.category).filter(Boolean))];

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'var(--tg-theme-bg-color, #ffffff)',
        color: 'var(--tg-theme-text-color, #000000)',
      }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-50 backdrop-blur-xl bg-[var(--tg-theme-bg-color,#ffffff)]/95"
      >
        <div className="px-5 pt-5 pb-4">
          {/* Search Bar */}
          <div className="relative">
            <Search
              className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 opacity-30"
              strokeWidth={1.5}
            />
            <input
              type="text"
              id="searchInput"
              placeholder="Поиск"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-6 pr-8 py-2 bg-transparent text-[15px] font-normal outline-none border-b border-transparent focus:border-[var(--tg-theme-text-color,#000000)] transition-colors duration-300 placeholder:opacity-30"
              style={{
                color: 'var(--tg-theme-text-color, #000000)',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => handleSearch('')}
                className="absolute right-0 top-1/2 -translate-y-1/2 p-1 opacity-30 hover:opacity-50 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Categories */}
        <div id="categoriesContainer" className="px-5 overflow-x-auto scrollbar-hide">
          <div className="flex gap-6 pb-3">
            <button
              onClick={() => handleCategoryChange('')}
              className={`category-btn relative text-[13px] tracking-wide whitespace-nowrap transition-all pb-2 ${
                currentCategory === ''
                  ? 'font-semibold'
                  : 'font-normal opacity-40 hover:opacity-60'
              }`}
            >
              Все
              {currentCategory === '' && (
                <span className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[var(--tg-theme-text-color,#000000)]" />
              )}
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                className={`category-btn relative text-[13px] tracking-wide whitespace-nowrap transition-all pb-2 ${
                  currentCategory === cat
                    ? 'font-semibold'
                    : 'font-normal opacity-40 hover:opacity-60'
                }`}
              >
                {GROUP_NAMES[cat] || cat}
                {currentCategory === cat && (
                  <span className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[var(--tg-theme-text-color,#000000)]" />
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Product Grid */}
      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 px-5 py-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[3/4] rounded bg-black/[0.03]" />
                <div className="mt-3 h-3 rounded bg-black/[0.03] w-4/5" />
                <div className="mt-2 h-3 rounded bg-black/[0.03] w-1/3" />
              </div>
            ))}
          </div>
        ) : searchLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border border-black/10 border-t-black rounded-full animate-spin" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-[13px] opacity-30">Нет товаров</p>
          </div>
        ) : (
          <div id="productsGrid" className="grid grid-cols-2 gap-x-4 gap-y-8 px-5 py-6">
            {filteredProducts.map((product) => (
              <div
                key={product.sku}
                onClick={() => openProduct(product)}
                data-sku={product.sku}
                className="card cursor-pointer transition-opacity active:opacity-70"
              >
                {/* Image */}
                <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-black/[0.02]">
                  <img
                    src={product.image_url || 'placeholder.jpg'}
                    alt={product.name}
                    loading="lazy"
                    onLoad={() => handleImageLoad(product.sku)}
                    className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ${
                      loadedImages.has(product.sku) ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
                    }`}
                  />
                  {!loadedImages.has(product.sku) && (
                    <div className="absolute inset-0 bg-black/[0.02]" />
                  )}
                </div>

                {/* Product info */}
                <div className="mt-3 space-y-1">
                  <h3 className="text-[12px] font-medium leading-tight line-clamp-2 opacity-70">
                    {shortenName(product.name)}
                  </h3>
                  <p className="text-[13px] font-semibold tracking-tight">
                    {product.price.toLocaleString('ru-RU')} сум
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal Overlay */}
      <div
        id="productModal"
        ref={modalRef}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
        className={`fixed inset-0 z-[100] flex items-end justify-center transition-opacity duration-300 ease-out ${
          modalOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
      >
        <div
          className={`w-full max-h-[90vh] rounded-t-[20px] overflow-hidden transition-transform duration-300 ease-out ${
            modalOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
          style={{
            background: 'var(--tg-theme-bg-color, #ffffff)',
            paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
          }}
        >
          {/* Modal Content */}
          <div className="px-5 pt-3 pb-6 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <h3 id="modalTitle" className="text-[16px] font-semibold leading-tight pr-8 tracking-tight">
                {selectedProduct?.name}
              </h3>
              <button
                onClick={closeModal}
                className="p-1 -mr-1 -mt-0.5 opacity-30 hover:opacity-50 transition-opacity"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Description */}
            <div
              id="modalDescription"
              className="text-[13px] leading-relaxed opacity-60 mb-8 whitespace-pre-wrap"
            >
              {modalDescription || (
                <span className="opacity-40">Загрузка…</span>
              )}
            </div>

            {/* Variants */}
            <div id="variantsContainer">
              {variantsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border border-black/10 border-t-black rounded-full animate-spin" />
                </div>
              ) : variants.length > 0 ? (
                <div className="space-y-4">
                  <p className="text-[11px] font-semibold tracking-widest uppercase opacity-40">
                    Выберите вариант
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {variants.map((variant) => (
                      <button
                        key={variant.variantSku}
                        data-sku={variant.variantSku}
                        data-price={variant.price}
                        data-name={variant.variantKey}
                        onClick={() => handleSelectVariant(variant, selectedProduct?.sku || '')}
                        className={`variant-tile relative aspect-square rounded-lg overflow-hidden transition-all ${
                          selectedVariant?.variantSku === variant.variantSku
                            ? 'ring-2 ring-[var(--tg-theme-text-color,#000000)] ring-offset-2'
                            : 'ring-1 ring-black/10 hover:ring-black/20'
                        }`}
                      >
                        <img
                          src={variant.image_url || 'placeholder.jpg'}
                          alt={variant.variantKey}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-2">
                          <span className="block text-[10px] font-medium text-white truncate">
                            {variant.variantKey}
                          </span>
                          <span className="block text-[9px] text-white/80">
                            {variant.price?.toLocaleString('ru-RU') || '—'} сум
                          </span>
                        </div>
                        {selectedVariant?.variantSku === variant.variantSku && (
                          <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-white flex items-center justify-center">
                            <ChevronRight className="w-3 h-3 text-black" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-center py-4 opacity-40">
                  Доступен только базовый вариант
                </p>
              )}
            </div>

            {/* Info Box */}
            <div className="mt-8 p-4 rounded-lg bg-black/[0.03] text-[11px] leading-relaxed opacity-50 space-y-2">
              <p>
                <span className="font-medium">🇷🇺</span> Цена зависит от варианта и доставки. Точную стоимость сообщим в чате после оформления.
              </p>
              <p>
                <span className="font-medium">🇺🇿</span> Narx variant va yetkazib berishga bog'liq. Aniq narxni buyurtmadan so'ng chatda xabar qilamiz.
              </p>
            </div>

            {/* Order Button */}
            <button
              id="orderButton"
              disabled={!selectedVariant}
              onClick={orderProduct}
              className={`w-full mt-6 py-4 rounded-lg text-[14px] font-semibold tracking-wide transition-all ${
                selectedVariant
                  ? 'bg-[var(--tg-theme-text-color,#000000)] text-[var(--tg-theme-bg-color,#ffffff)] active:opacity-80'
                  : 'bg-black/10 text-black/20 cursor-not-allowed'
              }`}
            >
              {selectedVariant
                ? selectedVariant.price > 0
                  ? `Оформить заказ — ${selectedVariant.price.toLocaleString('ru-RU')} сум`
                  : 'Оформить заказ'
                : 'Выберите вариант'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
