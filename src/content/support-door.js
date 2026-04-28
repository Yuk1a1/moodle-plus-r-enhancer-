/**
 * support-door.js — ダッシュボードのナビバー余白に「開発者を応援する」隠し扉を追加
 */

(function () {
    // ダッシュボード外では実行しない
    if (!location.pathname.startsWith('/my/')) return;

    const OFUSE_URL = 'https://ofuse.me/15b3b5e0';
    const CRYPTO_ADDRS = {
        'EVM (ETH/Base/POL)': '0x8fCdfFf07Ad81c0ebe2003049c5E0C30d9033858',
        'Solana': 'AQHs71TiBNF5GopaSgqQ2nfLLTsXw8aUaJA2fpnpp1pD'
    };

    function init() {
        // メインメニューの項目（ダッシュボードなど）を基準にリストを特定
        const navLinks = Array.from(document.querySelectorAll('.nav-link'));
        const dashboardLink = navLinks.find(el => 
            el.textContent.trim() === 'ダッシュボード' || 
            el.textContent.trim() === 'Dashboard'
        );

        const menuList = dashboardLink ? dashboardLink.closest('.navbar-nav') : 
                         document.querySelector('.primary-navigation .navbar-nav');

        if (!menuList || document.querySelector('.me-support-door-trigger')) return;

        // 隠し扉をメニュー項目として生成
        const trigger = document.createElement('li');
        trigger.className = 'me-support-door-trigger nav-item d-flex align-items-center';
        trigger.innerHTML = `
            <a class="nav-link d-flex align-items-center" href="#" title="Support the Developer" role="button" style="padding: 0 12px !important; font-size: 0.9rem !important; opacity: 0.8 !important;">
                <span class="me-support-label">開発支援</span>
                <span class="me-support-icon">☕</span>
            </a>
        `;
        
        trigger.querySelector('a').addEventListener('click', (e) => {
            e.preventDefault();
            toggleSupportModal();
        });

        // メニューの末尾に追加
        menuList.appendChild(trigger);
    }

    function toggleSupportModal() {
        let modal = document.querySelector('.me-support-modal');
        
        if (modal) {
            modal.classList.add('me-closing');
            setTimeout(() => modal.remove(), 300);
            return;
        }

        modal = document.createElement('div');
        modal.className = 'me-support-modal';
        modal.innerHTML = `
            <div class="me-modal-overlay"></div>
            <div class="me-modal-content">
                <button class="me-modal-close" id="me-close-btn">×</button>
                <div class="me-modal-header">
                    <h3>🚀 Moodle Enhancer を応援する</h3>
                    <p>この拡張機能があなたの大学生活を少しでも快適にできたなら、開発をサポートしていただけると非常に嬉しいです！</p>
                </div>
                
                <div class="me-modal-body">
                    <a href="${OFUSE_URL}" target="_blank" class="me-ofuse-btn">
                        <span>⛩️</span> OFUSE で応援メッセージを送る
                    </a>

                    <div class="me-crypto-section">
                        <h4>💎 仮想通貨で応援</h4>
                        <div class="me-crypto-list">
                            ${Object.entries(CRYPTO_ADDRS).map(([name, addr]) => `
                                <div class="me-crypto-item" data-addr="${addr}">
                                    <div class="me-crypto-info">
                                        <span class="me-crypto-name">${name}</span>
                                        <span class="me-crypto-addr">${addr.substring(0, 10)}...${addr.substring(addr.length - 6)}</span>
                                    </div>
                                    <span class="me-copy-btn">📋</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                
                <div class="me-modal-footer">
                    <p>☕ コーヒー1杯分の応援が、次なる機能改善のエネルギーになります。</p>
                </div>
            </div>
            <div id="me-support-toast" class="me-toast">コピーしました！🚀</div>
        `;

        document.body.appendChild(modal);

        // イベントリスナー
        modal.querySelector('.me-modal-overlay').addEventListener('click', toggleSupportModal);
        modal.querySelector('#me-close-btn').addEventListener('click', toggleSupportModal);
        
        modal.querySelectorAll('.me-crypto-item').forEach(item => {
            item.addEventListener('click', () => {
                const addr = item.getAttribute('data-addr');
                navigator.clipboard.writeText(addr).then(() => {
                    showToast('アドレスをクリップボードにコピーしました！');
                });
            });
        });
    }

    function showToast(message) {
        const toast = document.getElementById('me-support-toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('me-show');
        setTimeout(() => toast.classList.remove('me-show'), 2500);
    }

    // 初回実行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // SPA遷移対策（MutationObserver）
    const observer = new MutationObserver(() => {
        if (location.pathname.startsWith('/my/') && !document.querySelector('.me-support-door-trigger')) {
            init();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
